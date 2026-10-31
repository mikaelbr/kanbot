import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentDef } from "../agents/load.ts";
import {
	agentInstructions,
	CLAUDE_ATTRIBUTION,
	CLAUDE_DENY,
	claudeTools,
} from "../agents/sync.ts";
import {
	looksRateLimited,
	type Provider,
	type RunInput,
	type RunResult,
	spawnWorker,
} from "./types.ts";

type ResultEvent = {
	type: "result";
	is_error: boolean;
	subtype: string;
	result?: string;
	structured_output?: unknown;
	api_error_status?: number | null;
};

/** Claude Code headless (`claude -p`), using the logged-in subscription. */
export const claude: Provider = {
	name: "claude",
	async run(input: RunInput): Promise<RunResult> {
		const { agent } = input;
		// Pass agent definitions explicitly so runs don't depend on what is
		// committed in the worktree's .claude/agents.
		const tmp = await mkdtemp(join(tmpdir(), "kanbot-claude-"));
		const agentsFile = join(tmp, "agents.json");
		await Bun.write(agentsFile, JSON.stringify(claudeAgentsJson(input.agents)));
		const cmd = [
			"claude",
			"-p",
			"--agents",
			agentsFile,
			"--agent",
			agent.name,
			"--output-format",
			"stream-json",
			"--verbose",
			"--json-schema",
			JSON.stringify(input.schema),
			"--permission-mode",
			"acceptEdits",
			"--allowedTools",
			...headlessTools(agent),
			"--disallowedTools",
			...CLAUDE_DENY,
			"--no-session-persistence",
			// Isolate from the user's own setup: no user-level plugins, skills or
			// MCP servers, so workers only see the repo's agents and skills.
			"--setting-sources",
			"project,local",
			"--strict-mcp-config",
			"--settings",
			JSON.stringify(CLAUDE_ATTRIBUTION),
		];
		if (agent.models.claude) cmd.push("--model", agent.models.claude);
		if (agent.effort) cmd.push("--effort", agent.effort);

		const res = await spawnWorker(cmd, {
			cwd: input.cwd,
			stdin: input.prompt,
			timeoutMs: input.timeoutMs,
			logFile: input.logFile,
		}).finally(() => rm(tmp, { recursive: true, force: true }));
		if (res.timedOut)
			return { ok: false, error: "timed out", rateLimited: false };

		const result = res.stdout
			.split("\n")
			.reverse()
			.map((line) => {
				try {
					return JSON.parse(line) as ResultEvent;
				} catch {
					return null;
				}
			})
			.find((e) => e?.type === "result");

		if (!result || result.is_error || result.structured_output === undefined) {
			const detail =
				result?.result ?? res.stderr.slice(-2000) ?? `exit ${res.code}`;
			return {
				ok: false,
				error: `claude ${result?.subtype ?? "failed"}: ${detail}`,
				rateLimited:
					result?.api_error_status === 429 || looksRateLimited(detail),
			};
		}
		return { ok: true, output: result.structured_output };
	},
};

export function claudeAgentsJson(agents: AgentDef[]) {
	return Object.fromEntries(
		agents.map((a) => [
			a.name,
			{
				description: a.description,
				prompt: agentInstructions(a),
				tools: headlessTools(a),
				...(a.models.claude ? { model: a.models.claude } : {}),
				...(a.skills.length ? { skills: a.skills } : {}),
			},
		]),
	);
}

/** Headless column agents answer through the StructuredOutput tool. */
function headlessTools(agent: AgentDef) {
	const tools = claudeTools(agent);
	return agent.output ? [...tools, "StructuredOutput"] : tools;
}
