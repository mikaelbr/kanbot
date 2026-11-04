import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentDef } from "../agents/load.ts";
import { agentInstructions } from "../agents/sync.ts";
import { codexMcpArgs, type McpServer, readMcpServers } from "./mcp.ts";
import {
	looksRateLimited,
	type Provider,
	type RunInput,
	type RunResult,
	spawnWorker,
} from "./types.ts";

/** CLI args for a headless run. */
export function codexArgs(o: {
	agent: AgentDef;
	cwd: string;
	schemaFile: string;
	lastFile: string;
	mcpServers: Record<string, McpServer>;
}): string[] {
	const { agent } = o;
	// Agents that edit or run commands get no sandbox, like Claude workers:
	// Codex's sandbox blocks commit signing, browsers and `.agents`. The
	// worker env still keeps them off GitHub (see workerEnv).
	const sandbox =
		agent.tools.includes("edit") || agent.tools.includes("bash")
			? ["--dangerously-bypass-approvals-and-sandbox"]
			: ["--sandbox", "read-only"];
	const cmd = [
		"codex",
		"exec",
		"--json",
		"--ephemeral",
		// Isolate from the user's own setup: no user-level plugins or MCP
		// servers. Auth still comes from CODEX_HOME.
		"--ignore-user-config",
		...sandbox,
		"--cd",
		o.cwd,
		"--output-schema",
		o.schemaFile,
		"--output-last-message",
		o.lastFile,
		"-c",
		`developer_instructions=${JSON.stringify(agentInstructions(agent))}`,
		// The repo's committed MCP servers only.
		...codexMcpArgs(o.mcpServers),
	];
	if (agent.models.codex && agent.models.codex !== "default")
		cmd.push("--model", agent.models.codex);
	if (agent.effort) {
		cmd.push(
			"-c",
			`model_reasoning_effort="${agent.effort === "max" ? "xhigh" : agent.effort}"`,
		);
	}
	cmd.push("-");
	return cmd;
}

/** Codex CLI headless (`codex exec`), using the logged-in ChatGPT plan. */
export const codex: Provider = {
	name: "codex",
	async run(input: RunInput): Promise<RunResult> {
		const { agent } = input;
		const tmp = await mkdtemp(join(tmpdir(), "kanbot-codex-"));
		try {
			const schemaFile = join(tmp, "schema.json");
			const lastFile = join(tmp, "last.json");
			await Bun.write(schemaFile, JSON.stringify(input.schema));
			const cmd = codexArgs({
				agent,
				cwd: input.cwd,
				schemaFile,
				lastFile,
				mcpServers: await readMcpServers(input.cwd),
			});

			const res = await spawnWorker(cmd, {
				cwd: input.cwd,
				stdin: input.prompt,
				timeoutMs: input.timeoutMs,
				logFile: input.logFile,
			});
			if (res.timedOut)
				return { ok: false, error: "timed out", rateLimited: false };

			const last = Bun.file(lastFile);
			if (res.code !== 0 || !(await last.exists())) {
				const detail = (res.stderr || res.stdout).slice(-2000);
				return {
					ok: false,
					error: `codex exit ${res.code}: ${detail}`,
					rateLimited: looksRateLimited(detail),
				};
			}
			try {
				return { ok: true, output: JSON.parse(await last.text()) };
			} catch {
				return {
					ok: false,
					error: "codex final message was not JSON",
					rateLimited: false,
				};
			}
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	},
};
