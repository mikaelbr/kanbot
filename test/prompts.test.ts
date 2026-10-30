import { describe, expect, test } from "bun:test";
import { fixPrompt, reviewPrompt } from "../src/jobs/prompts.ts";
import { comment, item, pr } from "./helpers.ts";

// A human decision made on the PR (e.g. "rename the button") must reach later
// review and fix agents, or they "correct" it back to the plan.
const thread = {
	id: "T1",
	isResolved: true,
	path: "public/index.html",
	line: 14,
	comments: [
		comment('Should be "Nullstill"'),
		comment("Renamed. <!-- autogh:re:T1 -->"),
	],
};
const p = pr({
	threads: [thread],
	comments: [comment("Please keep the button grey")],
});
const it = item("review", { prs: [p] });

describe("PR history in prompts", () => {
	test("review prompt includes resolved human threads and comments", () => {
		const out = reviewPrompt(
			{ kind: "review", key: "r", item: it, pr: p, pass: 1 },
			"main",
		);
		expect(out).toContain('Should be "Nullstill"');
		expect(out).toContain("Please keep the button grey");
		expect(out).toContain("outrank");
	});

	test("fix prompt for review findings includes human decisions", () => {
		const out = fixPrompt(
			{
				kind: "fix",
				key: "f",
				item: it,
				pr: p,
				reason: { type: "review", pass: 1, findings: [] },
			},
			"main",
			null,
		);
		expect(out).toContain('Should be "Nullstill"');
	});

	test("threads without human comments are left out", () => {
		const botOnly = pr({
			threads: [{ ...thread, comments: [comment("x <!-- autogh:re:1 -->")] }],
		});
		const out = reviewPrompt(
			{ kind: "review", key: "r", item: item("review"), pr: botOnly, pass: 1 },
			"main",
		);
		expect(out).not.toContain("Human decisions");
	});
});
