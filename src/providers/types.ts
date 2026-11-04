import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** Push URL prefix that makes every `git push` from a worker fail. */
export const NO_PUSH = "kanbot-blocks-push://";

/**
 * Env for workers: never hand them GitHub credentials. Workers may run
 * without a sandbox, so also hide gh's login and make `git push` fail. The
 * daemon pushes from its own env.
 */
export function workerEnv(
	base: Record<string, string | undefined> = process.env,
): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(base)) {
		if (v === undefined) continue;
		if (/^(GH|GITHUB)_.*TOKEN$|^GH_ENTERPRISE_TOKEN$/.test(k)) continue;
		env[k] = v;
	}
	env.KANBOT_WORKER = "1";
	// An empty gh config dir: gh sees no login, keychain or not.
	const ghDir = join(tmpdir(), "kanbot-no-gh");
	mkdirSync(ghDir, { recursive: true });
	env.GH_CONFIG_DIR = ghDir;
	// Added to any GIT_CONFIG_* already set.
	const git: [string, string][] = [
		[`url.${NO_PUSH}.pushInsteadOf`, ""],
		["credential.helper", ""],
	];
	let n = Number(env.GIT_CONFIG_COUNT) || 0;
	for (const [k, v] of git) {
		env[`GIT_CONFIG_KEY_${n}`] = k;
		env[`GIT_CONFIG_VALUE_${n}`] = v;
		n++;
	}
	env.GIT_CONFIG_COUNT = String(n);
	return env;
}

/** Log event for one line of a worker's stderr. */
export const STDERR = "kanbot.stderr";

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
	// Whole lines only, so stderr can go into the log as it comes without
	// splitting a JSON event.
	const write = (line: string | null) => {
		if (line === null) return;
		sink.write(`${line}\n`);
		// Flush so `kanbot logs -f` and `status` see output as it comes.
		sink.flush();
	};
	const read = async (
		stream: ReadableStream<Uint8Array>,
		toLog: (line: string) => string | null,
	) => {
		const decoder = new TextDecoder();
		let all = "";
		let rest = "";
		for await (const chunk of stream) {
			const text = decoder.decode(chunk, { stream: true });
			all += text;
			const lines = (rest + text).split("\n");
			rest = lines.pop() ?? "";
			for (const l of lines) write(toLog(l));
		}
		if (rest) write(toLog(rest));
		return all;
	};
	const [stdout, stderr, code] = await Promise.all([
		read(proc.stdout, (l) => l),
		read(proc.stderr, (text) =>
			text.trim() ? JSON.stringify({ type: STDERR, text }) : null,
		),
		proc.exited,
	]);
	clearTimeout(timer);
	await sink.end();
	return { stdout, stderr, code, timedOut };
}
