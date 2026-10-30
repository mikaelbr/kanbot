import type {
	FixJob,
	ImplementJob,
	PlanJob,
	ReviewJob,
} from "../daemon/derive.ts";
import type { Comment, Issue, PR } from "../daemon/types.ts";
import { extractPlan, isAutogh, stripPlan } from "../github/markers.ts";
import type { Finding } from "../schemas/results.ts";

/*
 * Job prompts carry the *task*; the agent's own instructions (from
 * .autogh/agents) carry the *how*. Keep these factual and structured.
 */

const RULES = `## Ground rules
- You are running headless inside a git worktree. Nobody will answer questions mid-run.
- Never use \`gh\`, never \`git push\`, never contact GitHub. autogh applies your output.
- Your final answer must be the structured JSON result. Put everything the human should see in it.
- Write short and plain: only what the reader needs to act or understand. Don't restate the input or narrate your process.`;

function quote(text: string) {
	return text.trim() ? text.trim() : "_(empty)_";
}

function conversation(comments: Comment[], limit = 30) {
	const recent = comments.slice(-limit);
	if (!recent.length) return "_(no comments)_";
	return recent
		.map(
			(c) =>
				`**${isAutogh(c.body) ? "autogh (agent)" : `@${c.author}`}** — ${c.createdAt}\n${stripMarkers(c.body)}`,
		)
		.join("\n\n---\n\n");
}

function stripMarkers(body: string) {
	return body.replace(/<!--\s*autogh[^>]*-->/g, "").trim();
}

/**
 * Earlier human feedback on the PR, resolved or not. Without it, review and fix
 * agents see only the plan and "correct" decisions the human made on the PR.
 */
function humanDecisions(pr: PR) {
	const threads = pr.threads.filter((t) =>
		t.comments.some((c) => !isAutogh(c.body)),
	);
	const comments = [...pr.comments, ...pr.reviews].filter(
		(c) => !isAutogh(c.body),
	);
	if (!threads.length && !comments.length) return null;
	const parts = [
		"## Human decisions on this PR\nFeedback the human already gave on this PR. It outranks the plan and acceptance criteria where they conflict; do not undo or flag these changes.",
		...threads.map(
			(t) =>
				`### Review thread on ${t.path ?? "?"}${t.line ? `:${t.line}` : ""}${t.isResolved ? " (resolved)" : ""}\n${conversation(t.comments, 10)}`,
		),
	];
	if (comments.length)
		parts.push(`### PR comments\n${conversation(comments, 10)}`);
	return parts.join("\n\n");
}

function issueHeader(issue: Issue) {
	return `# Issue #${issue.number}: ${issue.title}
Labels: ${issue.labels.join(", ") || "none"}
URL: ${issue.url}`;
}

export function planPrompt(job: PlanJob, explore: number | null) {
	const { issue } = job.item;
	const plan = extractPlan(issue.body);
	const parts = [
		issueHeader(issue),
		`## Original description (written by the human)\n${quote(stripPlan(issue.body))}`,
		plan
			? `## Current plan\n${plan}`
			: "## Current plan\n_None yet. Write the first version._",
		`## Conversation so far\n${conversation(issue.comments)}`,
	];
	if (job.comments.length) {
		parts.push(
			`## New human comments to address\nReply to each one by its id in \`replies\`, and update the plan to reflect them. If a comment asks to split work or start a new issue, use \`newIssues\`.\n\n${job.comments
				.map((c) => `### commentId: ${c.id} (@${c.author})\n${c.body.trim()}`)
				.join("\n\n")}`,
		);
	}
	if (explore) {
		parts.push(
			`## Exploratory issue\nLabel explore:${explore}. The plan MUST have an "## Approaches" section with exactly ${explore} genuinely different approaches (### Approach 1: <name> … ### Approach ${explore}: <name>). Each will be implemented as a separate PR by a separate agent.`,
		);
	}
	if (issue.labels.includes("technical")) {
		parts.push(
			"## Technical issue\nLabeled `technical`: write a technical goal instead of a user story.",
		);
	}
	parts.push(RULES);
	return parts.join("\n\n");
}

export function implementPrompt(job: ImplementJob, base: string) {
	const { issue } = job.item;
	const parts = [
		issueHeader(issue),
		`## Approved plan\n${extractPlan(issue.body) ?? stripPlan(issue.body)}`,
	];
	if (job.variant !== null) {
		parts.push(
			`## Your variant: Approach ${job.variant} of ${job.variants}\nImplement ONLY "Approach ${job.variant}" from the plan. Other agents implement the other approaches in parallel; do not hedge toward them. The human will compare the PRs and merge one.`,
		);
	}
	const humanNotes = issue.comments.filter((c) => !isAutogh(c.body)).slice(-10);
	if (humanNotes.length)
		parts.push(
			`## Recent human comments on the issue\n${conversation(humanNotes)}`,
		);
	parts.push(
		`## Workspace\n- Branch \`${job.branch}\`, created from \`origin/${base}\`.\n- Commit your work with conventional commit messages. Uncommitted changes are committed for you, but prefer small commits.\n- Run the project's tests and linters before finishing and report them in \`testsRun\`.`,
		RULES,
	);
	return parts.join("\n\n");
}

export function reviewPrompt(job: ReviewJob, base: string) {
	const { issue } = job.item;
	const { pr } = job;
	return [
		issueHeader(issue),
		`## Plan / acceptance criteria\n${extractPlan(issue.body) ?? stripPlan(issue.body)}`,
		`## Pull request #${pr.number}: ${pr.title}\nBranch \`${pr.headRefName}\` (checked out). Diff with: \`git diff origin/${base}...HEAD\`. CI status: ${pr.checks ?? "none"}.\n\n### PR description\n${quote(stripMarkers(pr.body))}`,
		humanDecisions(pr),
		`## Review pass ${job.pass} of 2\nYou only review. Do not edit files or commit.`,
		RULES,
	]
		.filter(Boolean)
		.join("\n\n");
}

export function fixPrompt(job: FixJob, base: string, ciLogs: string | null) {
	const { issue } = job.item;
	const { pr } = job;
	const parts = [
		issueHeader(issue),
		`## Plan / acceptance criteria\n${extractPlan(issue.body) ?? stripPlan(issue.body)}`,
		`## Pull request #${pr.number}: ${pr.title}\nBranch \`${pr.headRefName}\` (checked out). Diff with: \`git diff origin/${base}...HEAD\`.\n\n### Current PR description\n${quote(stripMarkers(pr.body))}`,
	];
	const r = job.reason;
	const decisions = r.type === "feedback" ? null : humanDecisions(pr);
	if (decisions) parts.push(decisions);
	if (r.type === "review") {
		parts.push(
			`## Agent review pass ${r.pass} findings\nAddress each finding (use its id as \`ref\`). Nits are optional. If you disagree with a finding, leave the code and explain in \`reply\` with \`resolved: false\`.\n\n${findingsList(r.findings)}`,
		);
	} else if (r.type === "feedback") {
		parts.push(
			"## Human feedback\nThis is feedback from the human reviewer. It outranks the plan when they conflict. Answer every item below using its id as `ref`. Set `resolved: true` only when the change fully addresses it.",
		);
		for (const t of r.threads) {
			parts.push(
				`### ref: ${t.id} (review thread on ${t.path ?? "?"}${t.line ? `:${t.line}` : ""})\n${conversation(t.comments, 10)}`,
			);
		}
		for (const c of r.comments) {
			parts.push(
				`### ref: ${c.id} (comment by @${c.author})\n${c.body.trim()}`,
			);
		}
	} else {
		parts.push(
			`## CI is failing\nMake CI pass without weakening tests. Use \`ref: "ci"\` in \`addressed\`.\n\n${ciLogs || "_No logs available; reproduce locally with the project's test/lint commands._"}`,
		);
	}
	parts.push(RULES);
	return parts.join("\n\n");
}

export function findingsList(findings: Finding[]) {
	return findings
		.map(
			(f) =>
				`- **${f.id}** \`${f.severity}\`${f.path ? ` ${f.path}${f.line ? `:${f.line}` : ""}` : ""} — ${f.body}`,
		)
		.join("\n");
}
