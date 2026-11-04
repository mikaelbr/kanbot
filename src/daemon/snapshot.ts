import type { ColumnKey } from "../config.ts";
import { LABELS } from "../config.ts";
import {
	closingIssues,
	fetchIssue,
	fetchLabeledPRs,
	updatedSince,
} from "../github/api.ts";
import type { Gh } from "../github/gh.ts";
import { type Board, listItems } from "../github/project.ts";
import type { Trust } from "../github/trust.ts";
import type { Issue, Item, PR, Snapshot } from "./types.ts";

const ACTIVE: ReadonlySet<ColumnKey> = new Set([
	"planning",
	"ready",
	"inProgress",
	"review",
]);

export type SnapshotOptions = {
	/** Board items already listed, to save a query. */
	listed?: Awaited<ReturnType<typeof listItems>>;
	/** Client for issue and PR reads. Defaults to `gh`; the board always uses `gh`. */
	reads?: Gh;
	/** Reuse unchanged issues from earlier snapshots. */
	cache?: SnapshotCache;
};

/** Board items plus full detail for issues in columns agents work on. */
export async function takeSnapshot(
	gh: Gh,
	board: Board,
	trust: Trust,
	opts: SnapshotOptions = {},
): Promise<Snapshot> {
	try {
		return await snapshot(gh, board, trust, opts);
	} catch (e) {
		opts.cache?.clear();
		throw e;
	}
}

async function snapshot(
	gh: Gh,
	board: Board,
	trust: Trust,
	{ listed, reads = gh, cache }: SnapshotOptions,
): Promise<Snapshot> {
	const raw = listed ?? (await listItems(gh, board));
	const now = Date.now();
	const changed = cache ? await cache.changes(reads, now) : null;
	const items = await mapLimit(
		raw,
		4,
		async (r, position): Promise<Item | null> => {
			const active =
				r.state === "OPEN" && r.column !== null && ACTIVE.has(r.column);
			if (active) {
				return {
					itemId: r.itemId,
					column: r.column,
					position,
					issue:
						cache && changed
							? await cache.issue(reads, r.number, changed, now)
							: await fetchIssue(reads, r.number),
				};
			}
			if (r.state !== "CLOSED") return null;
			// Closed issues only need enough shape for cleanup.
			return {
				itemId: r.itemId,
				column: r.column,
				position,
				issue: {
					id: "",
					number: r.number,
					url: "",
					title: "",
					body: "",
					state: "CLOSED",
					labels: [],
					comments: [],
					prs: [],
					blockedBy: [],
				},
			};
		},
	);
	const labeled = (
		cache && changed
			? await cache.labeledPRs(reads, changed, now)
			: await fetchLabeledPRs(reads, LABELS.review)
	)
		.filter((p) => !p.headRefName.startsWith("kanbot/"))
		.map((p, i) => prItem(p, raw.length + i));
	const present = [...items.filter((i): i is Item => i !== null), ...labeled];
	const authors = present.flatMap(({ issue }) => [
		...issue.comments.map((c) => c.author),
		...issue.prs.flatMap((p) => [
			...p.comments.map((c) => c.author),
			...p.reviews.map((c) => c.author),
			...p.verdicts.map((v) => v.author),
			...p.threads.flatMap((t) => t.comments.map((c) => c.author)),
		]),
	]);
	return { items: present, trusted: await trust.resolve(authors) };
}

/** Refetch everything this often, for changes `updatedAt` misses (cross-repo blockers). */
const MAX_AGE_MS = 15 * 60_000;
/** Refetch PRs waiting on CI or mergeability this often: neither bumps `updatedAt`. */
const VOLATILE_MS = 2 * 60_000;
/** Ask for changes a bit further back, in case clocks differ. */
const OVERLAP_MS = 5 * 60_000;

/** Issue and PR numbers updated since the last snapshot. */
export type Changes = { numbers: ReadonlySet<number>; anyPR: boolean };

type Entry<T> = { value: T; at: number };

const volatile = (p: PR) =>
	p.state === "OPEN" &&
	(p.mergeable === "UNKNOWN" ||
		p.checks === "PENDING" ||
		p.checks === "EXPECTED");

/** Whether a cached issue must be fetched again. */
export function needsFetch(
	entry: Entry<Issue> | undefined,
	changed: Changes,
	now: number,
): boolean {
	if (!entry) return true;
	const age = now - entry.at;
	const i = entry.value;
	return (
		age > MAX_AGE_MS ||
		changed.numbers.has(i.number) ||
		i.prs.some((p) => changed.numbers.has(p.number)) ||
		i.blockedBy.some((b) => b.repo === null && changed.numbers.has(b.number)) ||
		(age > VOLATILE_MS && i.prs.some(volatile))
	);
}

/**
 * Issue details kept between daemon ticks. Each tick asks GitHub what changed
 * (one cheap REST call) and refetches only those issues, keeping the GraphQL
 * budget for real work.
 */
export class SnapshotCache {
	private issues = new Map<number, Entry<Issue>>();
	private labeled: Entry<PR[]> | null = null;
	private seen = new Map<number, string>();
	private since: number | null = null;

	async changes(gh: Gh, now: number): Promise<Changes> {
		const since = this.since;
		if (since === null) {
			this.since = now;
			return { numbers: new Set(), anyPR: false };
		}
		const fresh = (await updatedSince(gh, new Date(since - OVERLAP_MS))).filter(
			(u) => this.seen.get(u.number) !== u.updatedAt,
		);
		const numbers = new Set(fresh.map((u) => u.number));
		const prs = fresh.filter((u) => u.pr).map((u) => u.number);
		// A new PR doesn't bump the issue it closes; ask which one it is.
		const unknown = prs.filter((n) => !this.knowsPR(n));
		for (const issues of (await closingIssues(gh, unknown)).values())
			for (const n of issues) numbers.add(n);
		for (const u of fresh) this.seen.set(u.number, u.updatedAt);
		const anyPR = prs.length > 0;
		this.since = now;
		return { numbers, anyPR };
	}

	/** Drop cached details, e.g. after a failed snapshot saw changes it didn't fetch. */
	clear() {
		this.issues.clear();
		this.labeled = null;
	}

	private knowsPR(n: number) {
		if (this.labeled?.value.some((p) => p.number === n)) return true;
		for (const { value } of this.issues.values())
			if (value.prs.some((p) => p.number === n)) return true;
		return false;
	}

	async issue(gh: Gh, number: number, changed: Changes, now: number) {
		const entry = this.issues.get(number);
		if (entry && !needsFetch(entry, changed, now)) return entry.value;
		const value = await fetchIssue(gh, number);
		this.issues.set(number, { value, at: now });
		return value;
	}

	async labeledPRs(gh: Gh, changed: Changes, now: number) {
		const l = this.labeled;
		const age = l ? now - l.at : Infinity;
		if (
			l &&
			age <= MAX_AGE_MS &&
			!changed.anyPR &&
			!(age > VOLATILE_MS && l.value.some(volatile))
		)
			return l.value;
		const value = await fetchLabeledPRs(gh, LABELS.review);
		this.labeled = { value, at: now };
		return value;
	}
}

/** A `kanbot-review` PR as a Review item, so it gets the same review jobs. */
export function prItem(pr: PR, position: number): Item {
	return {
		itemId: "",
		column: "review",
		position,
		issue: {
			id: pr.id,
			number: pr.number,
			url: pr.url,
			title: pr.title,
			body: pr.body,
			state: "OPEN",
			labels: pr.labels,
			comments: [],
			prs: [pr],
			blockedBy: [],
			prOnly: true,
		},
	};
}

async function mapLimit<T, R>(
	xs: T[],
	limit: number,
	fn: (x: T, i: number) => Promise<R>,
): Promise<R[]> {
	const out: R[] = new Array(xs.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, xs.length) }, async () => {
			while (next < xs.length) {
				const i = next++;
				out[i] = await fn(xs[i] as T, i);
			}
		}),
	);
	return out;
}
