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
	| { kind: "compare"; item: Item; prs: PR[] }
	| { kind: "needsHuman"; number: number; why: string }
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
): Job | "agentReviewed" | "ciExhausted" | "conflictExhausted" | null {
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
