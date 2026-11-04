import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	duration,
	eventProblems,
	findRuns,
	formatEvent,
	legacyRun,
	listRuns,
	logPath,
	type Run,
	runId,
	runStatus,
	saveRun,
} from "../src/runs.ts";

const run = (over: Partial<Run>): Run => ({
	id: "x",
	key: "implement:#12:1",
	kind: "implement",
	agent: "implementer",
	provider: "claude",
	issue: 12,
	pid: 1,
	startedAt: "2026-11-04T10:00:00.000Z",
	...over,
});

test("status: running, ended, cut off", () => {
	expect(runStatus(run({}), () => true)).toBe("running");
	expect(runStatus(run({}), () => false)).toBe("cut off");
	expect(runStatus(run({ endedAt: "x", outcome: "ok" }))).toBe("ok");
	expect(runStatus(run({ endedAt: "x", outcome: "timed out" }))).toBe("failed");
});

test("finds runs by key, issue and PR", () => {
	const runs = [
		run({ id: "a" }),
		run({ id: "b", key: "fix:#12:pr34", kind: "fix", pr: 34 }),
		run({ id: "c", key: "plan:#7:", kind: "plan", issue: 7 }),
	];
	const ids = (q: string) => findRuns(runs, q).map((r) => r.id);
	expect(ids("12")).toEqual(["a", "b"]);
	expect(ids("#7")).toEqual(["c"]);
	expect(ids("34")).toEqual(["b"]);
	expect(ids("pr34")).toEqual(["b"]);
	expect(ids("implement:#12")).toEqual(["a"]);
	expect(ids("plan:#7:")).toEqual(["c"]);
	expect(ids("nope")).toEqual([]);
});

test("legacy log names parse", () => {
	const r = legacyRun(runId("fix:#12:pr34", new Date("2026-11-04T10:00:00Z")));
	expect(r.key).toBe("fix__12_pr34");
	expect(r.kind).toBe("fix");
	expect(r.issue).toBe(12);
	expect(r.startedAt).toBe("2026-11-04T10:00:00.000Z");
	expect(runStatus(r)).toBe("unknown");
});

test("lists runs newest first, with and without meta", async () => {
	const root = await mkdtemp(join(tmpdir(), "kanbot-runs-"));
	try {
		const old = runId("plan:#1:", new Date("2026-11-01T00:00:00Z"));
		const now = runId("plan:#2:", new Date("2026-11-02T00:00:00Z"));
		await Bun.write(logPath(root, old), "");
		await Bun.write(logPath(root, now), "");
		await saveRun(root, run({ id: now, key: "plan:#2:", issue: 2 }));
		const runs = await listRuns(root);
		expect(runs.map((r) => r.key)).toEqual(["plan:#2:", "plan__1_"]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("formats Claude events", () => {
	const lines = (e: object, v = false) => formatEvent(JSON.stringify(e), v);
	expect(
		lines({
			type: "assistant",
			message: {
				content: [
					{ type: "text", text: "Reading the code." },
					{ type: "tool_use", name: "Bash", input: { command: "bun test" } },
				],
			},
		}),
	).toEqual(["Reading the code.", "→ Bash bun test"]);
	const result = {
		type: "user",
		message: { content: [{ type: "tool_result", content: "12 pass" }] },
	};
	expect(lines(result)).toEqual([]);
	expect(lines(result, true)).toEqual(["  12 pass"]);
	expect(
		lines({ type: "result", subtype: "success", duration_ms: 90_000 }),
	).toEqual(["✔ success · 1m"]);
});

test("formats Codex events", () => {
	const lines = (e: object) => formatEvent(JSON.stringify(e));
	expect(
		lines({
			type: "item.started",
			item: { type: "command_execution", command: "ls" },
		}),
	).toEqual(["→ $ ls"]);
	expect(
		lines({
			type: "item.completed",
			item: { type: "agent_message", text: "Done." },
		}),
	).toEqual(["Done."]);
	expect(
		lines({
			type: "item.completed",
			item: { type: "file_change", changes: [{ path: "a.ts", kind: "add" }] },
		}),
	).toEqual(["→ add a.ts"]);
	expect(formatEvent("--- stderr ---")).toEqual(["--- stderr ---"]);
});

test("duration is short", () => {
	expect(duration(45_000)).toBe("45s");
	expect(duration(12 * 60_000)).toBe("12m");
	expect(duration(125 * 60_000)).toBe("2h05m");
});

test("finds permission denials and errors, not normal failures", () => {
	const p = (e: object) => eventProblems(JSON.stringify(e));
	const cmd = (exit_code: number, aggregated_output: string) => ({
		type: "item.completed",
		item: {
			type: "command_execution",
			command: "x",
			exit_code,
			aggregated_output,
		},
	});
	expect(p(cmd(1, "3 tests failed"))).toEqual([]);
	expect(
		p(cmd(133, "bootstrap_check_in: Permission denied (1100)"))[0],
	).toStartWith("denied: $ x");
	expect(
		p({
			type: "kanbot.stderr",
			text: "2026-11-04T12:18:16Z ERROR codex_core::tools::router: error=patch rejected: writing outside of the project",
		}),
	).toEqual(["patch rejected: writing outside of the project"]);
	expect(
		p({
			type: "user",
			message: {
				content: [
					{
						type: "tool_result",
						is_error: true,
						content:
							"Claude requested permissions to use Edit, but you haven't granted it yet.",
					},
				],
			},
		}),
	).toHaveLength(1);
	expect(p({ type: "turn.failed", error: { message: "boom" } })).toEqual([
		"boom",
	]);
	expect(eventProblems("plain text")).toEqual([]);
});
