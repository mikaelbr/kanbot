import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { type AgentDef, getAgent } from "../agents/load.ts";
import { type Config, LABELS } from "../config.ts";
import {
	type Action,
	exploreCount,
	type FixJob,
	type ImplementJob,
	type Job,
	type PlanJob,
	type ReviewJob,
	reviewPasses,
	variantOf,
} from "../daemon/derive.ts";
import type { Worktrees } from "../daemon/git.ts";
import type { Notifier } from "../daemon/notify.ts";
import type { State } from "../daemon/state.ts";
import {
	addLabels,
	addSubIssue,
	createIssue,
	createPR,
	failedCheckLogs,
	fetchIssue,
	mergePR,
	postComment,
	react,
	removeLabel,
	replyToThread,
	requestReview,
	resolveThread,
	updateIssueBody,
	updatePRBody,
} from "../github/api.ts";
import type { Gh } from "../github/gh.ts";
import {
	embedJson,
	marker,
	withDescription,
	withPlan,
} from "../github/markers.ts";
import { addToBoard, type Board, moveItem } from "../github/project.ts";
import { log } from "../log.ts";
import type { Provider } from "../providers/types.ts";
import {
	FixResult,
	type ImplementResult,
	jsonSchema,
	PlanResult,
	RESULT_SCHEMAS,
	type ResultSchemaName,
	ReviewResult,
} from "../schemas/results.ts";
import {
	findingsList,
	fixPrompt,
	implementPrompt,
	planPrompt,
	reviewPrompt,
} from "./prompts.ts";

export type JobDeps = {
	root: string;
	config: Config;
	/** The user's own client: reads, board moves, merges. */
	gh: Gh;
	/** Who kanbot talks as: comments, labels, PRs. Same as `gh` in user mode. */
	bot: Gh;
	/** Login of the user running the daemon. */
	me: string;
	board: Board;
	agents: AgentDef[];
	provider: Provider;
	worktrees: Worktrees;
	notify: Notifier;
	state: State;
};

export class RateLimited extends Error {}

/** Thrown when a job ended in a state the human must resolve; not retried. */
export class NeedsHuman extends Error {}

async function runAgent<N extends ResultSchemaName>(
	deps: JobDeps,
	job: Job,
	agentName: string,
	schema: N,
	cwd: string,
	prompt: string,
): Promise<z.infer<(typeof RESULT_SCHEMAS)[N]>> {
	const agent = getAgent(deps.agents, agentName);
	const logDir = join(deps.root, ".kanbot", "logs");
	await mkdir(logDir, { recursive: true });
	const logFile = join(
		logDir,
		`${new Date().toISOString().replace(/[:.]/g, "-")}_${job.key.replace(/[^a-zA-Z0-9-]/g, "_")}.jsonl`,
	);
	log.info(
		`▶ ${job.key} → ${agent.name} (${deps.provider.name}) log: ${logFile}`,
	);
	const res = await deps.provider.run({
		agent,
		agents: deps.agents,
		prompt,
		cwd,
		schema: jsonSchema(schema),
		timeoutMs: deps.config.timeoutMinutes[job.kind] * 60_000,
		logFile,
		repoRoot: deps.root,
	});
	if (!res.ok) {
		if (res.rateLimited) throw new RateLimited(res.error);
		throw new Error(res.error);
	}
	return RESULT_SCHEMAS[schema].parse(res.output) as z.infer<
		(typeof RESULT_SCHEMAS)[N]
	>;
}

/**
 * One worktree per branch, not per job: git refuses to check out a branch that
 * another worktree holds, and derive never runs two jobs on one branch at once.
 */
export function worktreeName(job: Job) {
	const n = job.item.issue.number;
	switch (job.kind) {
		case "plan":
			return `i${n}-plan`;
		case "implement":
			return `i${n}-v${job.variant ?? 1}`;
		default:
			return `i${n}-v${variantOf(job.pr.headRefName) ?? 1}`;
	}
}

export function runJob(job: Job, deps: JobDeps): Promise<void> {
	switch (job.kind) {
		case "plan":
			return plan(job, deps);
		case "implement":
			return implement(job, deps);
		case "review":
			return review(job, deps);
		case "fix":
			return fix(job, deps);
	}
}

// ---- plan -------------------------------------------------------------------

async function plan(job: PlanJob, deps: JobDeps) {
	const { gh, bot } = deps;
	const { issue } = job.item;
	await Promise.all(job.comments.map((c) => react(bot, c.id, "EYES")));
	const cwd = await deps.worktrees.detached(worktreeName(job));
	const result = await runAgent(
		deps,
		job,
		"planner",
		"plan-result",
		cwd,
		planPrompt(job, exploreCount(issue.labels)),
	);
	PlanResult.parse(result);

	// Re-read so concurrent human edits to the description are kept.
	const fresh = await fetchIssue(gh, issue.number);
	await updateIssueBody(bot, issue.number, withPlan(fresh.body, result.plan));

	const allowed = result.labels.filter(
		(l) => l === LABELS.technical || l.startsWith(LABELS.typePrefix),
	);
	await addLabels(
		bot,
		issue.number,
		allowed.filter((l) => !fresh.labels.includes(l)),
	);

	const created: string[] = [];
	for (const ni of result.newIssues) {
		const res = await createIssue(
			bot,
			ni.title,
			`${ni.body}\n\n_Split from #${issue.number} by kanbot._\n${marker("created", issue.number)}`,
		);
		if (!res) continue;
		if (ni.subIssue) await addSubIssue(bot, issue.id, res.node_id);
		await addToBoard(gh, deps.board, res.node_id, ni.column);
		created.push(`#${res.number}`);
	}

	const lines = [
		`**Plan ${job.initial ? "drafted" : "updated"}.** ${result.summary}`,
	];
	const replyFor = new Map(result.replies.map((r) => [r.commentId, r.body]));
	for (const c of job.comments) {
		const reply =
			replyFor.get(c.id) ?? "Noted; reflected in the plan where relevant.";
		lines.push(`> ${excerpt(c.body)}\n\n${reply}`);
	}
	if (created.length) lines.push(`Created ${created.join(", ")}.`);
	if (result.questions.length) {
		lines.push(
			`**Questions for you:**\n${result.questions.map((q) => `- ${q}`).join("\n")}`,
		);
	}
	lines.push(
		result.questions.length
			? "_Answer the questions to refine. kanbot won't start while the plan has open questions._"
			: "_Comment to refine. Drag the card to **Ready** when the plan is approved._",
	);
	lines.push(
		[marker("plan"), ...job.comments.map((c) => marker("re", c.id))].join("\n"),
	);
	await postComment(bot, issue.number, lines.join("\n\n"));
	await Promise.all(job.comments.map((c) => react(bot, c.id, "THUMBS_UP")));
}

// ---- implement ----------------------------------------------------------------

async function implement(job: ImplementJob, deps: JobDeps) {
	const { gh, bot, config, worktrees } = deps;
	const { issue } = job.item;
	if (job.item.column === "ready") {
		await moveItem(gh, deps.board, job.item.itemId, "inProgress");
		await addLabels(bot, issue.number, [LABELS.working]);
	}

	const resumed = await worktrees.remoteHas(job.branch);
	const cwd = await worktrees.checkout(worktreeName(job), job.branch);
	let result: z.infer<typeof ImplementResult> | null = null;
	if (!resumed) {
		const typeLabel = issue.labels
			.find((l) => l.startsWith(LABELS.typePrefix))
			?.slice(LABELS.typePrefix.length);
		const agentName =
			config.implementers[typeLabel ?? "default"] ??
			config.implementers.default ??
			"implementer-backend";
		result = await runAgent(
			deps,
			job,
			agentName,
			"implement-result",
			cwd,
			implementPrompt(job, config.baseBranch, config.capabilities),
		);
		if (result.status === "blocked") {
			await addLabels(bot, issue.number, [LABELS.needsHuman]);
			await postComment(
				bot,
				issue.number,
				`**Implementation blocked${job.variant ? ` (approach ${job.variant})` : ""}.** ${result.blockedReason ?? ""}\n\nRemove \`${LABELS.needsHuman}\` once resolved and kanbot will retry.\n${marker("blocked", job.branch)}`,
			);
			deps.notify.send(
				`Blocked: #${issue.number}`,
				result.blockedReason ?? issue.title,
				issue.url,
			);
			throw new NeedsHuman("agent reported blocked");
		}
		await worktrees.commitAll(
			cwd,
			`feat: ${result.prTitle} (#${issue.number})`,
		);
		if (
			(await worktrees.commitsAhead(cwd, `origin/${config.baseBranch}`)) === 0
		) {
			throw new Error("agent finished without any changes");
		}
		await worktrees.push(cwd, job.branch);
	} else {
		log.info(
			`${job.key}: branch ${job.branch} already pushed; opening PR only`,
		);
	}

	const variant =
		job.variant === null ? "" : ` [approach ${job.variant}/${job.variants}]`;
	const body = [
		withDescription(
			"",
			result
				? absoluteImages(result.prBody, config.repo, job.branch)
				: `Implements #${issue.number}.`,
		),
		result?.risks.length
			? `### Risks\n${result.risks.map((r) => `- ${r}`).join("\n")}`
			: "",
		result?.testsRun.length
			? `### Checks\n${result.testsRun.map((t) => `- ${t}`).join("\n")}`
			: "",
		job.variant === null
			? ""
			: `> Exploratory: approach ${job.variant} of ${job.variants}. Merging one closes the others.`,
		`Closes #${issue.number}`,
		marker("pr", issue.number),
	]
		.filter(Boolean)
		.join("\n\n");
	const pr = await createPR(bot, {
		title: `${result?.prTitle ?? issue.title}${variant}`,
		body,
		head: job.branch,
		base: config.baseBranch,
	});
	if (pr) {
		const labels = issue.labels.filter(
			(l) => l.startsWith(LABELS.typePrefix) || l === LABELS.technical,
		);
		if (job.variant !== null)
			labels.push(`${LABELS.variantPrefix}${job.variant}`);
		await addLabels(bot, pr.number, labels);
		log.info(`✔ opened ${pr.html_url}`);
	}
}

/** First line of a comment, cut at a word boundary, for quoting in replies. */
export function excerpt(body: string, max = 120) {
	const line = body.trim().split("\n")[0] ?? "";
	if (line.length <= max) return line;
	const cut = line.slice(0, max);
	const space = cut.lastIndexOf(" ");
	return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** PR bodies don't render repo-relative images; point them at the branch. */
export function absoluteImages(md: string, repo: string, branch: string) {
	return md.replace(
		/!\[([^\]]*)\]\((?!https?:|\/\/)(?:\.\/)?([^)\s]+)\)/g,
		(_, alt, path) =>
			`![${alt}](https://github.com/${repo}/blob/${branch}/${path}?raw=true)`,
	);
}

// ---- review -------------------------------------------------------------------

const PASS_AGENT = { 1: "reviewer-code", 2: "reviewer-spec" } as const;
const PASS_NAME = { 1: "code", 2: "spec" } as const;

async function review(job: ReviewJob, deps: JobDeps) {
	const cwd = await deps.worktrees.checkout(
		worktreeName(job),
		job.pr.headRefName,
	);
	const result = await runAgent(
		deps,
		job,
		PASS_AGENT[job.pass],
		"review-result",
		cwd,
		reviewPrompt(job, deps.config.baseBranch, deps.config.capabilities),
	);
	ReviewResult.parse(result);
	const icon = result.verdict === "approve" ? "✅" : "🛠️";
	const body = [
		`### ${icon} Agent review ${job.pass}/${reviewPasses(job.item.issue).length} (${PASS_NAME[job.pass]}): ${result.verdict === "approve" ? "approve" : "changes requested"}`,
		result.summary,
		result.findings.length ? findingsList(result.findings) : "_No findings._",
		marker("review", job.pass),
		embedJson("findings", result.findings),
	].join("\n\n");
	await postComment(deps.bot, job.pr.number, body);
}

// ---- fix ----------------------------------------------------------------------

async function fix(job: FixJob, deps: JobDeps) {
	const { gh, bot, worktrees, config } = deps;
	const { pr } = job;
	const cwd = await worktrees.checkout(worktreeName(job), pr.headRefName);
	if (job.reason.type === "conflict") return mergeBase(job, deps, cwd);
	const before = await worktrees.head(cwd);
	const logs =
		job.reason.type === "ci"
			? await failedCheckLogs(gh, pr.headSha).catch(() => null)
			: null;
	const result = await runAgent(
		deps,
		job,
		"fixer",
		"fix-result",
		cwd,
		fixPrompt(job, config.baseBranch, logs, config.capabilities),
	);
	FixResult.parse(result);

	await worktrees.commitAll(
		cwd,
		`fix: address ${job.reason.type === "ci" ? "CI failure" : "review feedback"} (#${job.item.issue.number})`,
	);
	const changed = (await worktrees.head(cwd)) !== before;
	if (changed) await worktrees.push(cwd, pr.headRefName);
	if (result.prBody) {
		const desc = absoluteImages(result.prBody, config.repo, pr.headRefName);
		await updatePRBody(bot, pr.number, withDescription(pr.body, desc));
	}
	const by = new Map(result.addressed.map((a) => [a.ref, a]));
	const pushed = changed ? "Pushed fixes." : "No code changes.";

	const r = job.reason;
	if (r.type === "review") {
		const lines = r.findings.map((f) => {
			const a = by.get(f.id);
			return `- ${a?.resolved ? "✅" : "⏭️"} **${f.id}** ${a?.reply ?? "Not addressed."}`;
		});
		await postComment(
			bot,
			pr.number,
			[
				`**Addressed agent review ${r.pass}/${reviewPasses(job.item.issue).length}.** ${result.summary} ${pushed}`,
				lines.join("\n"),
				marker("fixed", r.pass),
			].join("\n\n"),
		);
		return;
	}
	if (r.type === "ci") {
		await postComment(
			bot,
			pr.number,
			`**CI fix attempt.** ${result.summary} ${pushed}\n\n${marker("ci", pr.headSha)}`,
		);
		return;
	}

	// Answer every thread so it no longer has a human or Copilot as last word.
	let open = 0;
	for (const t of r.threads) {
		const a = by.get(t.id);
		await replyToThread(
			bot,
			t.id,
			`${a?.reply ?? "Looked at this but made no change."}\n\n${marker("re", t.id)}`,
		);
		if (a?.resolved) await resolveThread(bot, t.id);
		else open++;
	}
	if (r.type === "copilot") return;
	if (r.comments.length) {
		const lines = r.comments.map((c) => {
			const a = by.get(c.id);
			if (!a?.resolved) open++;
			return `> ${excerpt(c.body)}\n\n${a?.reply ?? "Noted."}`;
		});
		await postComment(
			bot,
			pr.number,
			[
				`**Feedback round.** ${result.summary} ${pushed}`,
				...lines,
				r.comments.map((c) => marker("re", c.id)).join("\n"),
			].join("\n\n"),
		);
	}
	const msg = open
		? `${open} item(s) need your input.`
		: "All feedback addressed — ready for another look.";
	if (!r.comments.length)
		await postComment(
			bot,
			pr.number,
			`${msg} ${pushed}\n\n${marker("feedback-round")}`,
		);
	deps.notify.send(
		`PR #${pr.number}: ${open ? "needs input" : "feedback addressed"}`,
		msg,
		pr.url,
	);
}

// ---- merge base ---------------------------------------------------------------

const CONFLICT_MARKER = /^(<{7}|>{7})( |$)/m;

/** Merge the base branch into a conflicting PR; the fixer resolves conflicts. */
async function mergeBase(job: FixJob, deps: JobDeps, cwd: string) {
	const { bot, worktrees, config } = deps;
	const { pr } = job;
	const base = `origin/${config.baseBranch}`;
	const files = await worktrees.merge(cwd, base);
	let summary = "It merged cleanly.";
	if (files.length) {
		const result = await runAgent(
			deps,
			job,
			"fixer",
			"fix-result",
			cwd,
			fixPrompt(
				job,
				config.baseBranch,
				files.map((f) => `- ${f}`).join("\n"),
				config.capabilities,
			),
		);
		FixResult.parse(result);
		const left: string[] = [];
		for (const f of files) {
			const file = Bun.file(join(cwd, f));
			if ((await file.exists()) && CONFLICT_MARKER.test(await file.text()))
				left.push(f);
		}
		if (left.length)
			throw new Error(`conflict markers left in ${left.join(", ")}`);
		summary = `${result.summary} Resolved conflicts in ${files.map((f) => `\`${f}\``).join(", ")}.`;
	}
	await worktrees.concludeMerge(cwd);
	await worktrees.commitAll(
		cwd,
		`fix: resolve merge conflicts (#${job.item.issue.number})`,
	);
	if (!(await worktrees.isAncestor(cwd, base)))
		throw new Error(`${base} was not merged`);
	await worktrees.push(cwd, pr.headRefName);
	await postComment(
		bot,
		pr.number,
		`**Merged \`${config.baseBranch}\`.** ${summary}\n\n${marker("conflict", pr.headSha)}`,
	);
}

// ---- deterministic actions ----------------------------------------------------

export async function applyAction(action: Action, deps: JobDeps) {
	const { gh, bot, config } = deps;
	switch (action.kind) {
		case "move":
			log.info(`#${action.item.issue.number} → ${action.to} (${action.why})`);
			return moveItem(gh, deps.board, action.item.itemId, action.to);
		case "label":
			await addLabels(bot, action.number, action.add);
			for (const l of action.remove) await removeLabel(bot, action.number, l);
			return;
		case "agentReviewed": {
			await addLabels(bot, action.pr.number, [LABELS.agentReviewed]);
			const next =
				config.merge.onApproval && action.pr.headRefName.startsWith("kanbot/")
					? "Approve to merge."
					: "Ready for you to test and merge.";
			await postComment(
				bot,
				action.pr.number,
				`**Agent review complete.** ${next}\n\n${marker("ready")}`,
			);
			// The bot opened the PR, so the user can be asked to review it.
			if (bot.isBot)
				await requestReview(bot, action.pr.number, [deps.me]).catch((e) =>
					log.warn(`request review on #${action.pr.number}: ${e}`),
				);
			deps.notify.send(
				`Ready to test: PR #${action.pr.number}`,
				action.pr.title,
				action.pr.url,
			);
			return;
		}
		case "openQuestions":
			return postComment(
				bot,
				action.item.issue.number,
				`**Not started: the plan has open questions.**\n\n${action.questions.map((q) => `- ${q}`).join("\n")}\n\nMove the card to **Planning** and answer them, or remove them from the plan. Then move it back to **Ready**.\n${marker("questions")}`,
			);
		case "merge": {
			const { pr } = action;
			log.info(`merging #${pr.number}, approved by ${action.by}`);
			try {
				await mergePR(gh, pr.number, pr.headSha, config.merge.method);
			} catch (e) {
				return applyAction(
					{
						kind: "needsHuman",
						number: action.item.issue.number,
						why: `Approved, but merging #${pr.number} failed:\n\n\`\`\`\n${String(e).slice(0, 1500)}\n\`\`\``,
					},
					deps,
				);
			}
			await postComment(
				bot,
				pr.number,
				`**Merged** after approval by @${action.by}.\n\n${marker("merged")}`,
			);
			deps.notify.send(`Merged PR #${pr.number}`, pr.title, pr.url);
			return;
		}
		case "compare": {
			const rows = action.prs.map(
				(p) =>
					`| ${p.labels.find((l) => l.startsWith(LABELS.variantPrefix)) ?? "?"} | #${p.number} | ${p.title} |`,
			);
			await postComment(
				bot,
				action.item.issue.number,
				`**All ${action.prs.length} approaches are agent-reviewed.** Try them and merge the one you want; the others are closed automatically.\n\n| Variant | PR | Title |\n|---|---|---|\n${rows.join("\n")}\n\n${marker("compare")}`,
			);
			deps.notify.send(
				`Compare approaches: #${action.item.issue.number}`,
				action.item.issue.title,
				action.item.issue.url,
			);
			return;
		}
		case "needsHuman":
			await addLabels(bot, action.number, [LABELS.needsHuman]);
			await postComment(
				bot,
				action.number,
				`**kanbot needs a human.** ${action.why}\n\nRemove \`${LABELS.needsHuman}\` to let agents retry.\n${marker("needs-human")}`,
			);
			deps.notify.send(`Needs human: #${action.number}`, action.why);
			return;
		case "resetFailures":
			deps.state.resetFailures(action.prefix);
			return;
		case "cleanup":
			return deps.worktrees.remove(`i${action.number}-`);
	}
}
