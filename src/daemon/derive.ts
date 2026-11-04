import {
	type ColumnKey,
	type Config,
	type JobKind,
	LABELS,
} from "../config.ts";
import {
	extractPlan,
	hasMarker,
	isKanbot,
	markerValues,
	readJson,
} from "../github/markers.ts";
import type { Finding } from "../schemas/results.ts";
import type {
	Comment,
	Issue,
	Item,
	PR,
	ReviewThread,
	Snapshot,
} from "./types.ts";

/*
 * Pure decision core: board snapshot in, work out. Everything the daemon does
 * is decided here, so it can be tested exhaustively without GitHub or LLMs.
 * State lives on GitHub (columns, labels, markers); `ctx` only carries what is
 * running right now and local failure counts.
 */

export type PlanJob = {
	kind: "plan";
	key: string;
	item: Item;
	/** Human comments not yet answered. */
	comments: Comment[];
	initial: boolean;
};

export type ImplementJob = {
	kind: "implement";
	key: string;
	item: Item;
	variant: number | null;
	variants: number;
	branch: string;
};

export type ReviewJob = {
	kind: "review";
	key: string;
	item: Item;
	pr: PR;
	pass: 1 | 2;
};

export type FixJob = {
	kind: "fix";
	key: string;
	item: Item;
	pr: PR;
	reason:
		| { type: "review"; pass: 1 | 2; findings: Finding[] }
		| { type: "feedback"; threads: ReviewThread[]; comments: Comment[] }
		| { type: "ci" }
		| { type: "conflict" }
		| { type: "copilot"; threads: ReviewThread[] };
};

export type Job = PlanJob | ImplementJob | ReviewJob | FixJob;

export type Action =
	| { kind: "move"; item: Item; to: ColumnKey; why: string }
	| { kind: "label"; number: number; add: string[]; remove: string[] }
	| { kind: "agentReviewed"; item: Item; pr: PR }
	| { kind: "merge"; item: Item; pr: PR; by: string }
	| { kind: "compare"; item: Item; prs: PR[] }
	| { kind: "needsHuman"; number: number; why: string }
	| { kind: "paused"; number: number; why: string; minutes: number }
	| { kind: "openQuestions"; item: Item; questions: string[] }
	| { kind: "waiting"; item: Item; blockers: string[] }
	| { kind: "resetFailures"; prefix: string }
	| { kind: "cleanup"; number: number };

export type DeriveContext = {
	config: Config;
	/** Keys of jobs currently running. */
	running: ReadonlySet<string>;
	/** Failure count per job key. */
	failures: ReadonlyMap<string, number>;
	/** Current time in ms, for waiting on Copilot. */
	now: number;
};

export const REVIEW_PASSES = [1, 2] as const;

/** PRs without a card have no plan to check, so they skip the spec pass. */
export const reviewPasses = (issue: Issue) =>
	issue.prOnly ? REVIEW_PASSES.slice(0, 1) : REVIEW_PASSES;
const MAX_CI_FIXES = 3;
const MAX_CONFLICT_FIXES = 3;

export function exploreCount(labels: string[]): number | null {
	for (const l of labels) {
		if (!l.startsWith(LABELS.explorePrefix)) continue;
		const n = Number(l.slice(LABELS.explorePrefix.length));
		if (Number.isInteger(n) && n >= 2 && n <= 4) return n;
	}
	return null;
}

export function branchFor(issue: number, variant: number | null) {
	return variant === null ? `kanbot/${issue}` : `kanbot/${issue}-v${variant}`;
}

export function variantOf(branch: string): number | null {
	const m = branch.match(/^kanbot\/\d+-v(\d)$/);
	return m ? Number(m[1]) : null;
}

const isHuman = (c: Comment, trusted: ReadonlySet<string>) =>
	!isKanbot(c.body) && trusted.has(c.author);

/** Comment ids already answered, via `<!-- kanbot:re:<id> -->` markers. */
function answered(comments: Comment[]): Set<string> {
	return new Set(comments.flatMap((c) => markerValues(c.body, "re")));
}

export function pendingComments(
	comments: Comment[],
	trusted: ReadonlySet<string>,
) {
	const done = answered(comments);
	return comments.filter((c) => isHuman(c, trusted) && !done.has(c.id));
}

export function reviewComment(pr: PR, pass: number) {
	return pr.comments.find((c) => hasMarker(c.body, "review", pass));
}

export function reviewFindings(pr: PR, pass: number): Finding[] {
	const c = reviewComment(pr, pass);
	return c ? (readJson<Finding[]>(c.body, "findings") ?? []) : [];
}

export function openFeedback(pr: PR, trusted: ReadonlySet<string>) {
	const threads = pr.threads.filter((t) => {
		const last = t.comments.at(-1);
		return !t.isResolved && last !== undefined && isHuman(last, trusted);
	});
	// Top-level comments and review bodies are answered by PR comments with re-markers.
	const comments = pendingComments([...pr.comments, ...pr.reviews], trusted);
	return { threads, comments };
}

/** GitHub Copilot code review's login, with or without the `[bot]` suffix. */
export const isCopilot = (login: string) =>
	login.startsWith("copilot-pull-request-reviewer");

/** Unresolved Copilot threads nobody has answered yet. */
export function copilotThreads(pr: PR) {
	return pr.threads.filter((t) => {
		const last = t.comments.at(-1);
		return !t.isResolved && last !== undefined && isCopilot(last.author);
	});
}

/**
 * Who approved the PR's current head, if anyone. A trusted reviewer's pending
 * change request blocks it, and approvals of older commits don't count.
 */
export function approvedBy(
	pr: PR,
	trusted: ReadonlySet<string>,
): string | null {
	const verdicts = pr.verdicts.filter((v) => trusted.has(v.author));
	if (verdicts.some((v) => v.state === "CHANGES_REQUESTED")) return null;
	return (
		verdicts.find((v) => v.state === "APPROVED" && v.commit === pr.headSha)
			?.author ?? null
	);
}

const OPEN_QUESTIONS = /^##\s+Open questions\s*$[\s\S]*?(?=^##\s|(?![\s\S]))/im;

/** The plan with its "## Open questions" section set to `questions`, last. */
export function withOpenQuestions(plan: string, questions: string[]): string {
	const rest = plan.replace(OPEN_QUESTIONS, "").trimEnd();
	if (!questions.length) return rest;
	return `${rest}\n\n## Open questions\n\n${questions.map((q) => `- ${q}`).join("\n")}`;
}

/** Bullets under the plan's "## Open questions". */
export function openQuestions(plan: string | null): string[] {
	const m = plan?.match(OPEN_QUESTIONS);
	if (!m) return [];
	return m[0]
		.split("\n")
		.slice(1)
		.map((l) => l.match(/^\s*[-*]\s+(.+)$/)?.[1]?.trim())
		.filter((q): q is string => Boolean(q));
}

/** Open "blocked by" issues, as `#12` or `owner/repo#12`. */
export function openBlockers(issue: Issue): string[] {
	return issue.blockedBy
		.filter((b) => b.state === "OPEN")
		.map((b) => `${b.repo ?? ""}#${b.number}`);
}

/** Was the waiting comment already posted for these blockers? */
function waitingPosted(comments: Comment[], blockers: string[]) {
	for (let i = comments.length - 1; i >= 0; i--) {
		const [last] = markerValues((comments[i] as Comment).body, "waiting");
		if (last) return last === blockers.join(",");
	}
	return false;
}

/** Was the open-questions gate already posted for the latest plan? */
function gatePosted(comments: Comment[]) {
	for (let i = comments.length - 1; i >= 0; i--) {
		const body = (comments[i] as Comment).body;
		if (hasMarker(body, "questions")) return true;
		if (hasMarker(body, "plan")) return false;
	}
	return false;
}

const fixCount = (pr: PR, kind: "ci" | "conflict") =>
	pr.comments.reduce((n, c) => n + markerValues(c.body, kind).length, 0);

export function derive(snapshot: Snapshot, ctx: DeriveContext) {
	const jobs: Job[] = [];
	const actions: Action[] = [];
	const { trusted } = snapshot;
	const { config } = ctx;

	const blocked = (issue: Issue, key: string) => {
		if (ctx.running.has(key)) return true;
		if (issue.labels.includes(LABELS.needsHuman)) return true;
		return (ctx.failures.get(key) ?? 0) >= config.maxAttempts;
	};

	const items = [...snapshot.items].sort((a, b) => a.position - b.position);
	const full = wipFull(snapshot, config).full;

	for (const item of items) {
		const { issue } = item;

		if (issue.state === "CLOSED" || item.column === "done") {
			actions.push({ kind: "cleanup", number: issue.number });
			continue;
		}

		// Human removed needs-human: give the agents fresh attempts.
		if (!issue.labels.includes(LABELS.needsHuman)) {
			const prefix = `#${issue.number}:`;
			for (const [key, n] of ctx.failures) {
				if (key.includes(prefix) && n >= config.maxAttempts) {
					actions.push({ kind: "resetFailures", prefix });
					break;
				}
			}
		}

		switch (item.column) {
			case "planning": {
				const key = `plan:#${issue.number}:`;
				if (blocked(issue, key)) break;
				const comments = pendingComments(issue.comments, trusted);
				const initial = extractPlan(issue.body) === null;
				if (initial || comments.length) {
					jobs.push({ kind: "plan", key, item, comments, initial });
				}
				break;
			}

			case "ready":
			case "inProgress": {
				// Open questions keep a plan out of Ready. Once started, it runs on.
				const questions =
					item.column === "ready" && !issue.prs.length
						? openQuestions(extractPlan(issue.body))
						: [];
				if (questions.length) {
					if (!gatePosted(issue.comments))
						actions.push({ kind: "openQuestions", item, questions });
					break;
				}
				// Open blockers keep it waiting; the next Ready card is picked.
				const blockers =
					item.column === "ready" && !issue.prs.length
						? openBlockers(issue)
						: [];
				if (blockers.length) {
					if (!waitingPosted(issue.comments, blockers))
						actions.push({ kind: "waiting", item, blockers });
					break;
				}
				// Too much waits on the human: don't start new cards.
				if (item.column === "ready" && !issue.prs.length && full) break;
				const n = exploreCount(issue.labels);
				const variants =
					n === null ? [null] : Array.from({ length: n }, (_, i) => i + 1);
				let missing = 0;
				for (const variant of variants) {
					const branch = branchFor(issue.number, variant);
					if (
						issue.prs.some(
							(p) => p.headRefName === branch && p.state !== "CLOSED",
						)
					) {
						continue;
					}
					missing++;
					const key = `implement:#${issue.number}:${variant ?? 1}`;
					if (blocked(issue, key)) continue;
					jobs.push({
						kind: "implement",
						key,
						item,
						variant,
						variants: variants.length,
						branch,
					});
				}
				if (missing === 0 && item.column === "inProgress") {
					actions.push({
						kind: "move",
						item,
						to: "review",
						why: "all PRs opened",
					});
					actions.push({
						kind: "label",
						number: issue.number,
						add: [],
						remove: [LABELS.working],
					});
				}
				break;
			}

			case "review": {
				const open = issue.prs.filter(
					(p) =>
						p.state === "OPEN" &&
						(issue.prOnly || p.headRefName.startsWith("kanbot/")),
				);
				for (const pr of open) {
					const job = prJob(item, pr, trusted, ctx, blocked);
					if (job === "agentReviewed")
						actions.push({ kind: "agentReviewed", item, pr });
					else if (typeof job === "object" && job && "mergeBy" in job)
						actions.push({ kind: "merge", item, pr, by: job.mergeBy });
					else if (job === "ciExhausted") {
						actions.push({
							kind: "needsHuman",
							number: issue.number,
							why: `CI still failing on #${pr.number} after ${MAX_CI_FIXES} fix attempts`,
						});
					} else if (job === "conflictExhausted") {
						actions.push({
							kind: "needsHuman",
							number: issue.number,
							why: `#${pr.number} still conflicts with the base branch after ${MAX_CONFLICT_FIXES} merge attempts`,
						});
					} else if (job) jobs.push(job);
				}
				if (
					exploreCount(issue.labels) !== null &&
					open.length > 1 &&
					open.every((p) => p.labels.includes(LABELS.agentReviewed)) &&
					!issue.comments.some((c) => hasMarker(c.body, "compare"))
				) {
					actions.push({ kind: "compare", item, prs: open });
				}
				break;
			}
		}
	}

	return { jobs, actions };
}

function prJob(
	item: Item,
	pr: PR,
	trusted: ReadonlySet<string>,
	ctx: DeriveContext,
	blocked: (issue: Issue, key: string) => boolean,
):
	| Job
	| { mergeBy: string }
	| "agentReviewed"
	| "ciExhausted"
	| "conflictExhausted"
	| null {
	const { issue } = item;
	const prKey = `#${issue.number}:pr${pr.number}`;
	// One job per PR at a time, whatever its kind.
	if ([...ctx.running].some((k) => k.endsWith(prKey))) return null;

	// 1. Human feedback always comes first.
	const feedback = openFeedback(pr, trusted);
	if (feedback.threads.length || feedback.comments.length) {
		const key = `fix:${prKey}`;
		if (blocked(issue, key)) return null;
		return {
			kind: "fix",
			key,
			item,
			pr,
			reason: { type: "feedback", ...feedback },
		};
	}

	// 2. Conflicts with the base branch, e.g. after commits made outside kanbot.
	if (pr.mergeable === "CONFLICTING") {
		if (!pr.comments.some((c) => hasMarker(c.body, "conflict", pr.headSha))) {
			if (fixCount(pr, "conflict") >= MAX_CONFLICT_FIXES) {
				return issue.labels.includes(LABELS.needsHuman)
					? null
					: "conflictExhausted";
			}
			const key = `fix:${prKey}`;
			if (blocked(issue, key)) return null;
			return { kind: "fix", key, item, pr, reason: { type: "conflict" } };
		}
	}

	// 3. Failing CI.
	if (pr.checks === "FAILURE" || pr.checks === "ERROR") {
		if (!pr.comments.some((c) => hasMarker(c.body, "ci", pr.headSha))) {
			if (fixCount(pr, "ci") >= MAX_CI_FIXES) {
				return issue.labels.includes(LABELS.needsHuman) ? null : "ciExhausted";
			}
			const key = `fix:${prKey}`;
			if (blocked(issue, key)) return null;
			return { kind: "fix", key, item, pr, reason: { type: "ci" } };
		}
	}

	// 4. Agent review passes, each followed by a fix when it found problems.
	for (const pass of reviewPasses(issue)) {
		if (!reviewComment(pr, pass)) {
			const key = `review${pass}:${prKey}`;
			if (blocked(issue, key)) return null;
			return { kind: "review", key, item, pr, pass };
		}
		const findings = reviewFindings(pr, pass).filter(
			(f) => f.severity !== "nit",
		);
		const fixed = pr.comments.some((c) => hasMarker(c.body, "fixed", pass));
		if (findings.length && !fixed) {
			const key = `fix:${prKey}`;
			if (blocked(issue, key)) return null;
			return {
				kind: "fix",
				key,
				item,
				pr,
				reason: { type: "review", pass, findings },
			};
		}
	}

	// 5. GitHub Copilot's review, when enabled. It arrives on its own schedule.
	if (ctx.config.review.copilot) {
		const threads = copilotThreads(pr);
		if (threads.length) {
			const key = `fix:${prKey}`;
			if (blocked(issue, key)) return null;
			return {
				kind: "fix",
				key,
				item,
				pr,
				reason: { type: "copilot", threads },
			};
		}
		const reviewed =
			pr.reviews.some((r) => isCopilot(r.author)) ||
			pr.threads.some((t) => t.comments.some((c) => isCopilot(c.author)));
		const waited =
			ctx.now - Date.parse(pr.createdAt) >=
			ctx.config.review.copilotWaitMinutes * 60_000;
		if (!reviewed && !waited) return null;
	}

	if (!pr.labels.includes(LABELS.agentReviewed)) return "agentReviewed";

	// 6. Approved by a human: merge. Only kanbot's own PRs, never kanbot-review ones.
	if (
		ctx.config.merge.onApproval &&
		pr.headRefName.startsWith("kanbot/") &&
		!issue.labels.includes(LABELS.needsHuman) &&
		pr.mergeable === "MERGEABLE" &&
		(pr.checks === "SUCCESS" || pr.checks === null)
	) {
		const by = approvedBy(pr, trusted);
		if (by) return { mergeBy: by };
	}
	return null;
}

/** Choose which waiting jobs get the free slots. Pure. */
export function schedule(
	jobs: Job[],
	freeSlots: number,
	priority: JobKind[],
): Job[] {
	const rank = (j: Job) => {
		const i = priority.indexOf(j.kind);
		return i === -1 ? priority.length : i;
	};
	// Stable sort keeps board order inside each kind.
	return [...jobs]
		.sort((a, b) => rank(a) - rank(b))
		.slice(0, Math.max(0, freeSlots));
}

/** A card that needs a human before it can move on. */
export type Waiting = {
	item: Item;
	why: string;
	/** Link to act on: the PR, or the issue. */
	url: string;
	/** When it started waiting, if known. */
	since: string | null;
};

/** Does the body carry `<!-- kanbot:<kind> -->` or `<!-- kanbot:<kind>:x -->`? */
const markedAs = (body: string, kind: string) =>
	body.includes(`<!-- kanbot:${kind} -->`) ||
	body.includes(`<!-- kanbot:${kind}:`);

const lastMarked = (comments: Comment[], ...kinds: string[]) =>
	comments.findLast((c) => kinds.some((k) => markedAs(c.body, k)));

/** First line of a kanbot comment, without bold. */
const headline = (c: Comment | undefined) =>
	c?.body.split("\n")[0]?.replaceAll("**", "").trim() || null;

/** Cards waiting on a human, oldest first. Pure, like `derive`. */
export function waitingOnHuman(snapshot: Snapshot, config: Config): Waiting[] {
	const { trusted } = snapshot;
	const out: Waiting[] = [];

	for (const item of snapshot.items) {
		const { issue } = item;
		if (issue.state === "CLOSED" || item.column === "done") continue;
		const add = (why: string, c?: Comment, url = issue.url) =>
			out.push({ item, why, url, since: c?.createdAt ?? null });

		if (issue.labels.includes(LABELS.needsHuman)) {
			const c = lastMarked(
				[...issue.comments, ...issue.prs.flatMap((p) => p.comments)].sort(
					(a, b) => a.createdAt.localeCompare(b.createdAt),
				),
				"needs-human",
				"blocked",
			);
			add(headline(c) ?? LABELS.needsHuman, c);
			continue;
		}

		switch (item.column) {
			case "planning": {
				const plan = extractPlan(issue.body);
				if (plan === null || pendingComments(issue.comments, trusted).length)
					break;
				const c = lastMarked(issue.comments, "plan");
				add(
					openQuestions(plan).length
						? "answer the plan's questions"
						: "approve the plan",
					c,
				);
				break;
			}

			case "ready": {
				if (issue.prs.length || !gatePosted(issue.comments)) break;
				if (!openQuestions(extractPlan(issue.body)).length) break;
				add("answer open questions", lastMarked(issue.comments, "questions"));
				break;
			}

			case "review": {
				const open = issue.prs.filter(
					(p) =>
						p.state === "OPEN" &&
						(issue.prOnly || p.headRefName.startsWith("kanbot/")),
				);
				const compare = lastMarked(issue.comments, "compare");
				if (exploreCount(issue.labels) !== null && compare) {
					add("pick an approach", compare);
					break;
				}
				for (const pr of open) {
					if (!pr.labels.includes(LABELS.agentReviewed)) continue;
					const feedback = openFeedback(pr, trusted);
					if (feedback.threads.length || feedback.comments.length) continue;
					const approved = approvedBy(pr, trusted) !== null;
					// Approved kanbot PRs are merged by the daemon.
					const autoMerge =
						config.merge.onApproval && pr.headRefName.startsWith("kanbot/");
					if (approved && autoMerge) continue;
					const c = lastMarked(pr.comments, "ready");
					out.push({
						item,
						why: `${approved ? "merge" : "review"} PR #${pr.number}`,
						url: pr.url,
						since: c?.createdAt ?? pr.createdAt,
					});
				}
				break;
			}
		}
	}

	// Oldest first; unknown age last.
	const key = (w: Waiting) => w.since ?? "\uffff";
	return out.sort((a, b) => key(a).localeCompare(key(b)));
}

/** The `wip.awaitingHuman` limit. When full, no new Ready card starts. */
export function wipFull(snapshot: Snapshot, config: Config) {
	const limit = config.wip.awaitingHuman;
	const waiting = limit === null ? 0 : waitingOnHuman(snapshot, config).length;
	return { waiting, limit, full: limit !== null && waiting >= limit };
}
