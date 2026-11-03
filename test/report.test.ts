import { describe, expect, test } from "bun:test";
import { UserError } from "../src/errors.ts";
import {
	type Activity,
	type BoardNow,
	buildReport,
	duration,
	parseSince,
	reasonOf,
	renderReport,
} from "../src/report.ts";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const since = new Date(NOW - 7 * 24 * 3_600_000);
const until = new Date(NOW);
const idle: BoardNow = { waiting: 0, limit: 4, needsHuman: 0, active: 1 };
const c = (body: string, createdAt: string) => ({ body, createdAt });

const pr = (over: Partial<Activity> = {}): Activity => ({
	kind: "pr",
	number: 10,
	title: "Add thing",
	url: "https://github.com/o/r/pull/10",
	headRefName: "kanbot/i3-add-thing",
	createdAt: "2026-11-01T00:00:00Z",
	mergedAt: "2026-11-02T06:00:00Z",
	comments: [
		c("Fixed. <!-- kanbot:fixed:1 -->", "2026-11-01T02:00:00Z"),
		c("CI <!-- kanbot:ci:abc -->", "2026-11-01T03:00:00Z"),
		c(
			"**Agent review complete.** <!-- kanbot:ready -->",
			"2026-11-01T12:00:00Z",
		),
		c("re <!-- kanbot:re:1 -->", "2026-11-01T13:00:00Z"),
	],
	...over,
});

describe("buildReport", () => {
	test("counts merged kanbot PRs, cycle, wait and fix loops", () => {
		const r = buildReport([pr()], idle, since, until);
		expect(r.merged).toHaveLength(1);
		expect(duration(r.merged[0]?.cycleMs ?? 0)).toBe("1d 6h");
		expect(duration(r.merged[0]?.waitMs ?? 0)).toBe("18h");
		expect(r.loops).toEqual({ review: 1, ci: 1, conflict: 0, feedback: 0 });
		expect(r.health).toBe("ON_TRACK");
	});

	test("skips human branches, unmerged PRs and merges before the period", () => {
		const r = buildReport(
			[
				pr({ headRefName: "feature/x" }),
				pr({ mergedAt: null }),
				pr({ mergedAt: "2026-10-01T00:00:00Z" }),
			],
			idle,
			since,
			until,
		);
		expect(r.merged).toHaveLength(0);
		expect(r.loops.review).toBe(0);
	});

	test("collects needs-human and blocked reasons in the period", () => {
		const issue: Activity = {
			kind: "issue",
			number: 3,
			title: "x",
			url: "u",
			createdAt: "2026-10-01T00:00:00Z",
			comments: [
				c(
					"<sub>🤖 kanbot</sub>\n\n**kanbot needs a human.** Tests need a database.\n\nRemove `needs-human` to let agents retry.\n<!-- kanbot:needs-human -->",
					"2026-11-02T00:00:00Z",
				),
				c(
					"**Implementation blocked.** Old. <!-- kanbot:blocked:b -->",
					"2026-10-02T00:00:00Z",
				),
			],
		};
		const r = buildReport([issue], idle, since, until);
		expect(r.needsHuman).toEqual([
			{ number: 3, url: "u", reason: "Tests need a database." },
		]);
	});

	test("health follows fixed rules", () => {
		const none = { ...idle, active: 0 };
		expect(buildReport([], none, since, until).health).toBe("INACTIVE");
		expect(buildReport([], { ...idle, waiting: 2 }, since, until).health).toBe(
			"OFF_TRACK",
		);
		const full = buildReport([pr()], { ...idle, waiting: 4 }, since, until);
		expect(full.health).toBe("AT_RISK");
		expect(full.why).toEqual(["WIP limit reached (4/4)."]);
	});

	test("suggests at most two next steps", () => {
		const r = buildReport([pr()], { ...idle, needsHuman: 1 }, since, until);
		expect(r.next.length).toBeLessThanOrEqual(2);
		expect(r.next[0]).toContain("needs-human");
		expect(r.next[1]).toContain("waiting on you");
	});
});

test("renderReport leads with health and period", () => {
	const text = renderReport(buildReport([pr()], idle, since, until));
	expect(text.split("\n")[0]).toBe("**On track** · 2026-10-27 → 2026-11-03");
	expect(text).toContain("- Merged: 1 PR(s)");
	expect(text).toContain("median 1d 6h");
});

test("reasonOf takes the first line after the lead", () => {
	expect(
		reasonOf("**Implementation blocked.** No SDK. <!-- kanbot:blocked:x -->"),
	).toBe("No SDK.");
	expect(reasonOf("<!-- kanbot:needs-human -->")).toBe("no reason given");
});

test("parseSince reads durations and dates", () => {
	expect(parseSince("2d", NOW).toISOString()).toBe("2026-11-01T12:00:00.000Z");
	expect(parseSince("1w", NOW).toISOString()).toBe("2026-10-27T12:00:00.000Z");
	expect(parseSince("2026-10-01", NOW).toISOString()).toBe(
		"2026-10-01T00:00:00.000Z",
	);
	expect(() => parseSince("soon", NOW)).toThrow(UserError);
});
