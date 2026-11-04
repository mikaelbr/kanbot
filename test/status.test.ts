import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { age, problemLines } from "../src/commands/status.ts";
import { legacyRun } from "../src/runs.ts";

test("age is short", () => {
	const now = Date.parse("2026-10-10T12:00:00Z");
	expect(age("2026-10-10T11:55:00Z", now)).toBe("5m");
	expect(age("2026-10-10T09:00:00Z", now)).toBe("3h");
	expect(age("2026-10-08T12:00:00Z", now)).toBe("2d");
	expect(age("2026-10-11T00:00:00Z", now)).toBe("0m");
});

test("problem lines show the last two errors and where to see all", () => {
	const run = { ...legacyRun("x_implement:#1"), key: "implement:#1" };
	expect(problemLines(run, [])).toEqual([]);
	const lines = problemLines(run, ["a", "b", "c"]).map(
		stripVTControlCharacters,
	);
	expect(lines).toEqual([
		"    ✖ 3 errors so far, last two:",
		"      b",
		"      c",
		"      See all: kanbot logs implement:#1",
	]);
});
