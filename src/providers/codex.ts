import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentInstructions } from "../agents/sync.ts";
import { git } from "../daemon/git.ts";
import {
	looksRateLimited,
	type Provider,
	type RunInput,
	type RunResult,
	spawnWorker,
} from "./types.ts";

/** Codex CLI headless (`codex exec`), using the logged-in ChatGPT plan. */
export function codex({ networkAccess }: { networkAccess: boolean }): Provider {
	return {
		name: "codex",
		async run(input: RunInput): Promise<RunResult> {
			const { agent } = input;
			const tmp = await mkdtemp(join(tmpdir(), "kanbot-codex-"));
			try {
				const schemaFile = join(tmp, "schema.json");
				const lastFile = join(tmp, "last.json");
				await Bun.write(schemaFile, JSON.stringify(input.schema));
				// Worktree commits write into the main repo's .git dir.
				const gitDir = await git(
					input.cwd,
					"rev-parse",
					"--path-format=absolute",
					"--git-common-dir",
				);
				const sandbox =
					agent.tools.includes("edit") || agent.tools.includes("bash")
						? "workspace-write"
						: "read-only";
				const cmd = [
					"codex",
					"exec",
					"--json",
					"--ephemeral",
					"--sandbox",
					sandbox,
					"--cd",
					input.cwd,
					"--add-dir",
					gitDir,
					"--output-schema",
					schemaFile,
					"--output-last-message",
					lastFile,
					"-c",
					`developer_instructions=${JSON.stringify(agentInstructions(agent))}`,
				];
				if (networkAccess)
					cmd.push("-c", "sandbox_workspace_write.network_access=true");
				if (agent.models.codex && agent.models.codex !== "default")
					cmd.push("--model", agent.models.codex);
				if (agent.effort) {
					cmd.push(
						"-c",
						`model_reasoning_effort="${agent.effort === "max" ? "xhigh" : agent.effort}"`,
					);
				}
				cmd.push("-");

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
}
