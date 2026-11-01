import type { ColumnKey } from "../config.ts";
import { LABELS } from "../config.ts";
import { fetchIssue, fetchLabeledPRs } from "../github/api.ts";
import type { Gh } from "../github/gh.ts";
import { type Board, listItems } from "../github/project.ts";
import type { Trust } from "../github/trust.ts";
import type { Item, PR, Snapshot } from "./types.ts";

const ACTIVE: ReadonlySet<ColumnKey> = new Set([
	"planning",
	"ready",
	"inProgress",
	"review",
]);

/** Board items plus full detail for issues in columns agents work on. */
export async function takeSnapshot(
	gh: Gh,
	board: Board,
	trust: Trust,
): Promise<Snapshot> {
	const raw = await listItems(gh, board);
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
					issue: await fetchIssue(gh, r.number),
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
	const labeled = (await fetchLabeledPRs(gh, LABELS.review))
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
