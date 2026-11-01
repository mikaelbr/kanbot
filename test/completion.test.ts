import { describe, expect, test } from "bun:test";
import { buildSpec, render, SHELLS } from "../src/completion.ts";
import { main } from "../src/main.ts";

// Completions are generated from the real command tree, so a new command or
// flag shows up without touching the completion code.
describe("completion", async () => {
	const spec = await buildSpec(main);

	test("walks lazy subcommands and enum options", () => {
		const board = spec.subs.find((s) => s.name === "board");
		expect(board?.subs.map((s) => s.name)).toEqual(["create", "link"]);
		const init = spec.subs.find((s) => s.name === "init");
		const provider = init?.flags.find((f) => f.name === "provider");
		expect(provider?.options).toEqual(["claude", "codex"]);
	});

	for (const shell of SHELLS)
		test(`${shell} script names every command`, () => {
			const out = render(shell, spec);
			for (const name of ["init", "board", "link", "run", "dry-run"])
				expect(out).toContain(name);
		});

	for (const shell of ["zsh", "bash"] as const)
		test.skipIf(!Bun.which(shell))(`${shell} script parses`, async () => {
			const p = Bun.spawn([shell, "-n"], {
				stdin: new Blob([render(shell, spec)]),
				stderr: "pipe",
			});
			expect(await p.exited).toBe(0);
		});
});
