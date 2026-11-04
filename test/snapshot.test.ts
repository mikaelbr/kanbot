import { expect, test } from "bun:test";
import { needsFetch, SnapshotCache } from "../src/daemon/snapshot.ts";
import { Gh } from "../src/github/gh.ts";
import { item, pr } from "./helpers.ts";

const T = Date.parse("2026-11-04T12:00:00Z");
const MIN = 60_000;
const none = { numbers: new Set<number>(), anyPR: false };
const changed = (...n: number[]) => ({ numbers: new Set(n), anyPR: false });
const entry = (over = {}, at = T) => ({
	value: item("review", over).issue,
	at,
});

test("fetches an issue it hasn't seen", () => {
	expect(needsFetch(undefined, none, T)).toBe(true);
});

test("keeps an unchanged issue", () => {
	expect(needsFetch(entry({ number: 1 }), none, T + MIN)).toBe(false);
});

test("refetches when the issue, its PR or a blocker changed", () => {
	const e = entry({
		number: 1,
		prs: [pr({ number: 7 })],
		blockedBy: [{ number: 3, repo: null, state: "OPEN" }],
	});
	expect(needsFetch(e, changed(1), T)).toBe(true);
	expect(needsFetch(e, changed(7), T)).toBe(true);
	expect(needsFetch(e, changed(3), T)).toBe(true);
	expect(needsFetch(e, changed(9), T)).toBe(false);
});

test("refetches PRs waiting on CI every few minutes, and everything eventually", () => {
	const pending = entry({ prs: [pr({ checks: "PENDING" })] });
	expect(needsFetch(pending, none, T + MIN)).toBe(false);
	expect(needsFetch(pending, none, T + 3 * MIN)).toBe(true);
	expect(needsFetch(entry(), none, T + 16 * MIN)).toBe(true);
});

/** Fake gh: REST issue list and GraphQL issue/closing-refs queries. */
class FakeGh extends Gh {
	updated: { number: number; updated_at: string; pull_request?: object }[] = [];
	closes: Record<number, number[]> = {};
	issueFetches: number[] = [];

	constructor() {
		super("acme/app");
	}

	override async rest<T>(): Promise<T> {
		return this.updated as T;
	}

	override async query<T>(
		q: string,
		vars: Record<string, unknown> = {},
	): Promise<T> {
		if (q.includes("closingIssuesReferences")) {
			const repository: Record<string, unknown> = {};
			for (const [n, issues] of Object.entries(this.closes))
				repository[`p${n}`] = {
					closingIssuesReferences: {
						nodes: issues.map((number) => ({ number })),
					},
				};
			return { repository } as T;
		}
		const number = vars.number as number;
		this.issueFetches.push(number);
		const nodes = { nodes: [] };
		return {
			repository: {
				issue: {
					id: `I${number}`,
					number,
					url: "",
					title: "",
					body: "",
					state: "OPEN",
					labels: nodes,
					comments: nodes,
					blockedBy: nodes,
					closedByPullRequestsReferences: nodes,
				},
			},
		} as T;
	}
}

test("cache refetches only issues GitHub reports as updated", async () => {
	const gh = new FakeGh();
	const cache = new SnapshotCache();
	let c = await cache.changes(gh, T);
	await cache.issue(gh, 1, c, T);
	await cache.issue(gh, 2, c, T);
	expect(gh.issueFetches).toEqual([1, 2]);

	gh.updated = [{ number: 2, updated_at: "2026-11-04T12:00:30Z" }];
	c = await cache.changes(gh, T + MIN);
	await cache.issue(gh, 1, c, T + MIN);
	await cache.issue(gh, 2, c, T + MIN);
	expect(gh.issueFetches).toEqual([1, 2, 2]);

	// Same update seen again in the overlap window: no refetch.
	c = await cache.changes(gh, T + 2 * MIN);
	await cache.issue(gh, 2, c, T + 2 * MIN);
	expect(gh.issueFetches).toEqual([1, 2, 2]);
});

test("a new PR marks the issue it closes as changed", async () => {
	const gh = new FakeGh();
	const cache = new SnapshotCache();
	await cache.changes(gh, T);
	gh.updated = [{ number: 8, updated_at: "x", pull_request: {} }];
	gh.closes = { 8: [1] };
	const c = await cache.changes(gh, T + MIN);
	expect([...c.numbers].sort()).toEqual([1, 8]);
	expect(c.anyPR).toBe(true);
});
