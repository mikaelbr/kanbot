import { describe, expect, test } from "bun:test";
import type { Job } from "../src/daemon/derive.ts";
import { worktreeName } from "../src/jobs/run.ts";
import { item, pr } from "./helpers.ts";

const it = item("review", { number: 7 });

describe("worktreeName", () => {
	// git refuses to check out one branch in two worktrees, so every job on a
	// branch must reuse the same worktree.
	test("implement, review and fix on one branch share a worktree", () => {
		const p = pr({ headRefName: "kanbot/7" });
		const jobs: Job[] = [
			{
				kind: "implement",
				key: "i",
				item: it,
				variant: null,
				variants: 1,
				branch: "kanbot/7",
			},
			{ kind: "review", key: "r", item: it, pr: p, pass: 1 },
			{ kind: "fix", key: "f", item: it, pr: p, reason: { type: "ci" } },
		];
		expect(new Set(jobs.map(worktreeName))).toEqual(new Set(["i7-v1"]));
	});

	test("explore variants get their own worktree", () => {
		const review: Job = {
			kind: "review",
			key: "r",
			item: it,
			pr: pr({ headRefName: "kanbot/7-v2" }),
			pass: 1,
		};
		const implement: Job = {
			kind: "implement",
			key: "i",
			item: it,
			variant: 2,
			variants: 2,
			branch: "kanbot/7-v2",
		};
		expect(worktreeName(review)).toBe("i7-v2");
		expect(worktreeName(implement)).toBe("i7-v2");
	});

	test("planning uses a detached worktree of its own", () => {
		expect(
			worktreeName({
				kind: "plan",
				key: "p",
				item: it,
				comments: [],
				initial: true,
			}),
		).toBe("i7-plan");
	});
});
