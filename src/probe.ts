import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentDef } from "./agents/load.ts";
import { git } from "./daemon/git.ts";
import type { Provider } from "./providers/types.ts";
import {
	logPath,
	logsDir,
	type Run,
	runId,
	runProblems,
	saveRun,
} from "./runs.ts";
import { ImplementResult, jsonSchema } from "./schemas/results.ts";

export const PROBE_KEY = "probe";
const FILE = "kanbot-probe.txt";
const SKILL = ".agents/skills/kanbot-probe/SKILL.md";
const COMMIT = "chore: kanbot permission probe";

export const probeAgent: AgentDef = {
	name: "kanbot-probe",
	tier: "column",
	description:
		"Checks that workers can edit files, write skills and commit, but not push.",
	models: { claude: "haiku", codex: "gpt-6-luna" },
	effort: "low",
	tools: ["read", "edit", "bash"],
	skills: [],
	subagents: [],
	output: "implement-result",
	file: "",
	body: `You check that kanbot workers have the permissions they need. Do these steps in order. If one fails, go on with the next.

1. With your file edit tool, not the shell, create \`${FILE}\` containing \`ok\`.
2. With your file edit tool, create \`${SKILL}\` containing \`ok\`.
3. Run \`git add -A && git commit -m "${COMMIT}"\`.
4. Run \`git push <push target from the prompt> HEAD:refs/heads/kanbot-probe\`. kanbot blocks pushes, so this should fail. Don't count it as a failed step or retry it.

Return status \`done\` if steps 1-3 worked. Otherwise \`blocked\`, with each failed step and its exact error in blockedReason. Leave the other fields empty.`,
};

export type ProbeCheck = { name: string; ok: boolean; detail?: string };

/**
 * Run a tiny job the way the daemon would, in a throwaway worktree, and check
 * what it managed to do. The transcript is kept as run `probe`.
 */
export async function probe(
	root: string,
	provider: Provider,
): Promise<ProbeCheck[]> {
	const tmp = await mkdtemp(join(tmpdir(), "kanbot-probe-"));
	const cwd = join(tmp, "wt");
	await git(root, "worktree", "add", "--detach", cwd, "HEAD");
	try {
		await mkdir(join(cwd, ".agents", "skills"), { recursive: true });
		// A local remote, so a push that gets through never reaches GitHub.
		const remote = join(tmp, "remote.git");
		await git(tmp, "init", "-q", "--bare", remote);
		await mkdir(logsDir(root), { recursive: true });
		const run: Run = {
			id: runId(PROBE_KEY),
			key: PROBE_KEY,
			kind: PROBE_KEY,
			agent: probeAgent.name,
			provider: provider.name,
			issue: 0,
			pid: process.pid,
			startedAt: new Date().toISOString(),
		};
		await saveRun(root, run);
		const res = await provider.run({
			agent: probeAgent,
			agents: [probeAgent],
			prompt: `Run the permission check. Push target: ${remote}`,
			cwd,
			schema: jsonSchema("implement-result"),
			timeoutMs: 5 * 60_000,
			logFile: logPath(root, run.id),
			repoRoot: root,
		});
		await saveRun(root, {
			...run,
			endedAt: new Date().toISOString(),
			outcome: res.ok ? "ok" : "failed",
			...(res.ok ? {} : { error: res.error.slice(0, 500) }),
		});
		const out = res.ok ? ImplementResult.safeParse(res.output).data : undefined;
		const head = await git(cwd, "log", "-1", "--format=%s").catch(() => "");
		const pushed = await git(
			remote,
			"rev-parse",
			"--verify",
			"-q",
			"refs/heads/kanbot-probe",
		).then(
			() => true,
			() => false,
		);
		// The blocked push is expected.
		const problems = (await runProblems(root, run)).filter(
			(p) => !/git push|kanbot-blocks-push/.test(p),
		);
		return [
			{
				name: "worker finished the job",
				ok: res.ok && out?.status === "done",
				detail: res.ok
					? out?.blockedReason?.slice(0, 600)
					: res.error.slice(0, 300),
			},
			{ name: "worker can edit files", ok: existsSync(join(cwd, FILE)) },
			{
				name: "worker can edit .agents/skills",
				ok: existsSync(join(cwd, SKILL)),
			},
			{ name: "worker can commit", ok: head === COMMIT },
			{ name: "worker can't push", ok: !pushed },
			{
				name: "worker hit no permission errors",
				ok: !problems.length,
				detail: problems.slice(-3).join("\n") || undefined,
			},
		];
	} finally {
		await git(root, "worktree", "remove", "--force", cwd).catch(() => {});
		await rm(tmp, { recursive: true, force: true });
	}
}
