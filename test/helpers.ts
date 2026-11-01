import type { ColumnKey } from "../src/config.ts";
import { ConfigSchema } from "../src/config.ts";
import type { Comment, Issue, Item, PR } from "../src/daemon/types.ts";

export const config = ConfigSchema.parse({ repo: "acme/app" });
export const HUMAN = "alice";
export const STRANGER = "mallory";
export const trusted = new Set([HUMAN]);

let seq = 0;
export function comment(body: string, author = HUMAN): Comment {
	seq++;
	return {
		id: `C${seq}`,
		databaseId: seq,
		author,
		body,
		createdAt: `2026-10-${String((seq % 28) + 1).padStart(2, "0")}T00:00:00Z`,
	};
}

export function pr(over: Partial<PR> = {}): PR {
	seq++;
	return {
		id: `PR${seq}`,
		number: 100 + seq,
		url: "",
		title: "PR",
		body: "",
		state: "OPEN",
		headRefName: "kanbot/1",
		headSha: `sha${seq}`,
		createdAt: "2026-10-01T00:00:00Z",
		labels: [],
		comments: [],
		reviews: [],
		verdicts: [],
		threads: [],
		checks: "SUCCESS",
		mergeable: "MERGEABLE",
		...over,
	};
}

export function item(
	column: ColumnKey,
	over: Partial<Issue> = {},
	position = 0,
): Item {
	return {
		itemId: `ITEM${over.number ?? 1}`,
		column,
		position,
		issue: {
			id: `I${over.number ?? 1}`,
			number: 1,
			url: "",
			title: "Issue",
			body: "Users need a thing",
			state: "OPEN",
			labels: [],
			comments: [],
			prs: [],
			...over,
		},
	};
}

export const ctx = (
	over: {
		running?: string[];
		failures?: [string, number][];
		config?: typeof config;
		now?: number;
	} = {},
) => ({
	config: over.config ?? config,
	now: over.now ?? Date.parse("2026-10-02T00:00:00Z"),
	running: new Set(over.running ?? []),
	failures: new Map(over.failures ?? []),
});
