import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { State } from "../src/daemon/state.ts";

test("pause reports only the first pause until a job succeeds", async () => {
	const state = await new State(
		await mkdtemp(join(tmpdir(), "kanbot-state-")),
	).load();
	expect(await state.pause(1000)).toBe(true);
	expect(await state.pause(1000)).toBe(false);
	await state.succeed("plan:#1:");
	expect(await state.pause(1000)).toBe(true);
});
