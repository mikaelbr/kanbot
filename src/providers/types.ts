import type { AgentDef } from "../agents/load.ts";
import type { Config } from "../config.ts";

export type RunInput = {
	agent: AgentDef;
	/** All agents, so the worker can delegate to subagents. */
	agents: AgentDef[];
	prompt: string;
	cwd: string;
	/** JSON Schema the final answer must match. */
	schema: object;
	timeoutMs: number;
	logFile: string;
	/** Main repo checkout, e.g. so sandboxes can write the shared .git dir. */
	repoRoot: string;
};

export type RunResult =
	| { ok: true; output: unknown }
	| { ok: false; error: string; rateLimited: boolean };

export interface Provider {
	readonly name: Config["provider"];
	run(input: RunInput): Promise<RunResult>;
}

const RATE_LIMIT =
	/usage limit|rate limit|rate_limit|429|quota|limit reached|try again later/i;

export function looksRateLimited(text: string) {
	return RATE_LIMIT.test(text);
}

/** Env for workers: never hand them GitHub credentials. */
export function workerEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (v === undefined) continue;
		if (/^(GH|GITHUB)_.*TOKEN$|^GH_ENTERPRISE_TOKEN$/.test(k)) continue;
		env[k] = v;
	}
	env.KANBOT_WORKER = "1";
	return env;
}

export type Spawned = {
	stdout: string;
	stderr: string;
	code: number;
	timedOut: boolean;
};

/** Spawn a worker, tee stdout to the job log, enforce the timeout. */
export async function spawnWorker(
	cmd: string[],
	{
		cwd,
		stdin,
		timeoutMs,
		logFile,
	}: { cwd: string; stdin: string; timeoutMs: number; logFile: string },
): Promise<Spawned> {
	const proc = Bun.spawn(cmd, {
		cwd,
		env: workerEnv(),
		stdin: new Blob([stdin]),
		stdout: "pipe",
		stderr: "pipe",
	});
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		proc.kill("SIGTERM");
		setTimeout(() => proc.kill("SIGKILL"), 10_000);
	}, timeoutMs);
	const sink = Bun.file(logFile).writer();
	const decoder = new TextDecoder();
	let stdout = "";
	const readOut = (async () => {
		for await (const chunk of proc.stdout) {
			sink.write(chunk);
			// Flush so `kanbot logs -f` sees output as it comes.
			sink.flush();
			stdout += decoder.decode(chunk, { stream: true });
		}
	})();
	const [stderr, code] = await Promise.all([
		new Response(proc.stderr).text(),
		proc.exited,
		readOut,
	]);
	clearTimeout(timer);
	if (stderr) sink.write(`\n--- stderr ---\n${stderr}`);
	await sink.end();
	return { stdout, stderr, code, timedOut };
}
