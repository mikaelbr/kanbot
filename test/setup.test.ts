import { expect, test } from "bun:test";
import { askNumber, choose } from "../src/ask.ts";
import { parseProjectUrl } from "../src/commands/board.ts";
import {
	askBoard,
	askIdentity,
	askMerge,
	askOptions,
	askProvider,
} from "../src/setup.ts";

const answers =
	(...a: (string | null)[]) =>
	() =>
		a.shift() ?? null;
const quiet = () => {};

const out = { installed: false, ok: false };
const inn = { installed: true, ok: true };

test("provider defaults to the one that is logged in", () => {
	expect(askProvider(answers(""), quiet, { claude: inn, codex: inn })).toBe(
		"claude",
	);
	expect(askProvider(answers(""), quiet, { claude: out, codex: inn })).toBe(
		"codex",
	);
	expect(askProvider(answers("1"), quiet, { claude: out, codex: inn })).toBe(
		"claude",
	);
});

test("choose asks again on a bad answer", () => {
	const said: string[] = [];
	const pick = choose(answers("9", "x", "2"), (l) => said.push(l), "Q?", [
		{ value: "a", label: "A" },
		{ value: "b", label: "B" },
	]);
	expect(pick).toBe("b");
	expect(said.filter((l) => l.includes("Type a number"))).toHaveLength(2);
});

test("askNumber takes a number, the default or none", () => {
	expect(askNumber(answers(""), quiet, "N?", 3)).toBe(3);
	expect(askNumber(answers("0", "5"), quiet, "N?", 3)).toBe(5);
	expect(askNumber(answers("none"), quiet, "N?", 4, { none: "none" })).toBe(
		null,
	);
});

test("identity and merge default to you, no merge", () => {
	expect(askIdentity(answers(""), quiet)).toBe("user");
	expect(askIdentity(answers("2"), quiet)).toBe("app");
	expect(askMerge(answers(""), quiet, "user")).toEqual({});
	expect(askMerge(answers(""), quiet, "app")).toEqual({ onApproval: true });
});

test("options keep defaults unless changed", () => {
	expect(askOptions(answers(""), quiet)).toEqual({});
	expect(askOptions(answers("y", "", "", "", ""), quiet)).toEqual({});
	expect(
		askOptions(
			answers("y", "2", "5", "nope", "https://ntfy.sh/me", "y"),
			quiet,
		),
	).toEqual({
		concurrency: 2,
		wip: { awaitingHuman: 5 },
		notify: { webhook: "https://ntfy.sh/me" },
		review: { copilot: true },
	} as never);
});

test("board choice parses a project URL, or skips", () => {
	expect(askBoard(answers(""), quiet, parseProjectUrl)).toEqual({
		kind: "create",
	});
	expect(
		askBoard(
			answers("2", "github.com/x", "https://github.com/orgs/acme/projects/7"),
			quiet,
			parseProjectUrl,
		),
	).toEqual({ kind: "link", owner: "acme", number: 7 });
	expect(askBoard(answers("2", ""), quiet, parseProjectUrl)).toEqual({
		kind: "skip",
	});
	expect(askBoard(answers("3"), quiet, parseProjectUrl)).toEqual({
		kind: "skip",
	});
});

test("parseProjectUrl reads user and org projects", () => {
	expect(
		parseProjectUrl("https://github.com/users/me/projects/3/views/1"),
	).toEqual({ owner: "me", number: 3 });
	expect(parseProjectUrl("https://github.com/me/repo")).toBeNull();
});
