import { describe, expect, test } from "bun:test";
import { blockedByLinks } from "../src/jobs/run.ts";

describe("blockedByLinks", () => {
	test("slices are chained after the planned issue", () => {
		const links = blockedByLinks(
			[{ blockedBy: [0] }, { blockedBy: [1] }, { blockedBy: [] }],
			["P", "A", "B", "C"],
		);
		expect(links).toEqual([
			["A", "P"],
			["B", "A"],
		]);
	});

	test("skips uncreated issues, bad indexes and self-links", () => {
		const links = blockedByLinks(
			[{ blockedBy: [0] }, { blockedBy: [1, 2, 9] }],
			["P", undefined, "B"],
		);
		expect(links).toEqual([]);
	});
});
