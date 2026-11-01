import { describe, expect, test } from "bun:test";
import { prItem } from "../src/daemon/snapshot.ts";
import {
	fixPrompt,
	implementPrompt,
	reviewPrompt,
} from "../src/jobs/prompts.ts";
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
		comment("Renamed. <!-- kanbot:re:T1 -->"),
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
			threads: [{ ...thread, comments: [comment("x <!-- kanbot:re:1 -->")] }],
		});
		const out = reviewPrompt(
			{ kind: "review", key: "r", item: item("review"), pr: botOnly, pass: 1 },
			"main",
		);
		expect(out).not.toContain("Human decisions");
	});
});

test("review prompt for a PR without a card uses the PR as spec", () => {
	const p = pr({ body: "Adds login rate limiting", headRefName: "feature/x" });
	const it = prItem(p, 0);
	const out = reviewPrompt(
		{ kind: "review", key: "r", item: it, pr: p, pass: 1 },
		"main",
	);
	expect(out).toContain("# Pull request #");
	expect(out).toContain("Adds login rate limiting");
	expect(out).toContain("Review pass 1 of 1");
});

describe("capabilities in prompts", () => {
	const caps = {
		verify: { use: "verify-ui", when: "UI changes", required: true },
		bench: { use: "bench", required: false },
	};
	const impl = {
		kind: "implement" as const,
		key: "i",
		item: item("ready"),
		variant: null,
		variants: 1,
		branch: "kanbot/1",
	};
	const rev = {
		kind: "review" as const,
		key: "r",
		item: it,
		pr: p,
		pass: 1 as const,
	};
	const fix = {
		kind: "fix" as const,
		key: "f",
		item: it,
		pr: p,
		reason: { type: "ci" as const },
	};

	test("implement, review and fix prompts list the map", () => {
		for (const out of [
			implementPrompt(impl, "main", caps),
			reviewPrompt(rev, "main", caps),
			fixPrompt(fix, "main", null, caps),
		]) {
			expect(out).toContain("## Capabilities");
			expect(out).toContain("| verify | UI changes | `verify-ui` | yes |");
			expect(out).toContain("| bench | When it fits the task | `bench` | no |");
		}
	});

	test("nothing is rendered without a map", () => {
		for (const out of [
			implementPrompt(impl, "main"),
			reviewPrompt(rev, "main"),
			fixPrompt(fix, "main", null, {}),
		]) {
			expect(out).not.toContain("Capabilities");
		}
	});
});
