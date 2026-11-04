import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { color } from "./color.ts";

/**
 * One agent run. Stored as `<id>.json` next to its `<id>.jsonl` transcript in
 * `.kanbot/logs`, so `status` and `logs` can see what the daemon is doing.
 */
export type Run = {
	id: string;
	key: string;
	kind: string;
	agent: string;
	provider: string;
	issue: number;
	pr?: number;
	/** Daemon pid; a run without `endedAt` whose daemon is gone was cut off. */
	pid: number;
	startedAt: string;
	endedAt?: string;
	outcome?: "ok" | "failed" | "rate limited" | "timed out";
	error?: string;
};

export type RunStatus = "running" | "ok" | "failed" | "cut off" | "unknown";

export const logsDir = (root: string) => join(root, ".kanbot", "logs");
export const logPath = (root: string, id: string) =>
	join(logsDir(root), `${id}.jsonl`);
export const metaPath = (root: string, id: string) =>
	join(logsDir(root), `${id}.json`);

/** File-safe id, sortable by start time. */
export function runId(key: string, start = new Date()) {
	return `${start.toISOString().replace(/[:.]/g, "-")}_${key.replace(/[^a-zA-Z0-9-]/g, "_")}`;
}

export function saveRun(root: string, run: Run) {
	return Bun.write(metaPath(root, run.id), JSON.stringify(run));
}

function alive(pid: number) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		// EPERM: it exists but belongs to someone else.
		return (e as NodeJS.ErrnoException).code === "EPERM";
	}
}

export function runStatus(run: Run, isAlive = alive): RunStatus {
	if (!run.endedAt) return isAlive(run.pid) ? "running" : "cut off";
	if (!run.outcome) return "unknown";
	return run.outcome === "ok" ? "ok" : "failed";
}

/** All runs, newest first. Old logs without meta are listed from the name. */
export async function listRuns(root: string): Promise<Run[]> {
	const dir = logsDir(root);
	if (!existsSync(dir)) return [];
	const files = await readdir(dir);
	const runs: Run[] = [];
	for (const f of files) {
		if (!f.endsWith(".jsonl")) continue;
		const id = f.slice(0, -".jsonl".length);
		const meta = Bun.file(metaPath(root, id));
		if (await meta.exists()) {
			try {
				runs.push(await meta.json());
				continue;
			} catch {}
		}
		runs.push(legacyRun(id));
	}
	return runs.sort((a, b) => b.id.localeCompare(a.id));
}

/** Best guess from `<iso>_<key>` for logs written before meta files. */
export function legacyRun(id: string): Run {
	const [stamp = "", key = id] = id.split(/_(.*)/s);
	const iso = stamp.replace(
		/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
		"$1:$2:$3.$4Z",
	);
	return {
		id,
		key,
		kind: key.split("_")[0] ?? "?",
		agent: "?",
		provider: "?",
		issue: Number(key.match(/__(\d+)/)?.[1] ?? 0),
		pid: 0,
		startedAt: Number.isNaN(Date.parse(iso)) ? new Date(0).toISOString() : iso,
		endedAt: iso,
	};
}

/**
 * Runs matching `query`: a job key or part of it (`implement:#12`), an issue
 * or PR number (`12`, `#12`, `pr34`) or a run id. Newest first.
 */
export function findRuns(runs: Run[], query: string): Run[] {
	const q = query.trim();
	const exact = runs.filter((r) => r.id === q || r.key === q);
	if (exact.length) return exact;
	const n = q.match(/^#?(\d+)$/)?.[1];
	if (n) return runs.filter((r) => r.issue === Number(n) || r.pr === Number(n));
	const pr = q.match(/^pr#?(\d+)$/i)?.[1];
	if (pr) return runs.filter((r) => r.pr === Number(pr));
	return runs.filter((r) => r.key.includes(q) || r.id.includes(q));
}

/** Short duration like `45s`, `12m` or `2h05m`. */
export function duration(ms: number) {
	const s = Math.max(0, Math.round(ms / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m`;
	return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}

const STATUS_COLOR: Record<RunStatus, (s: string) => string> = {
	running: color.cyan,
	ok: color.green,
	failed: color.red,
	"cut off": color.yellow,
	unknown: color.dim,
};

/** One line per run: status, age or duration, key, agent, start time. */
export function runLine(run: Run, now = Date.now(), isAlive = alive) {
	const status = runStatus(run, isAlive);
	const start = Date.parse(run.startedAt);
	const took =
		status === "unknown"
			? "—"
			: duration((run.endedAt ? Date.parse(run.endedAt) : now) - start);
	const label = run.outcome && run.outcome !== "ok" ? run.outcome : status;
	const when = new Date(start).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
	return `${STATUS_COLOR[status](label.padEnd(12))} ${took.padStart(6)}  ${run.key.padEnd(24)} ${color.dim(`${run.agent} · ${when}`)}`;
}

// ---- transcript -----------------------------------------------------------------

const clip = (s: string, max: number) => {
	const one = s.replace(/\s+/g, " ").trim();
	return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

/** The most telling field of a tool call's input. */
function toolArg(input: Record<string, unknown> = {}) {
	for (const k of [
		"command",
		"file_path",
		"path",
		"pattern",
		"url",
		"query",
		"description",
		"prompt",
	]) {
		const v = input[k];
		if (typeof v === "string") return v;
	}
	return JSON.stringify(input);
}

function resultText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content))
		return content
			.map((c) => (typeof c?.text === "string" ? c.text : ""))
			.join(" ");
	return "";
}

/**
 * Readable lines for one transcript line, Claude stream-json or Codex
 * `exec --json`. Unknown events print nothing; `verbose` adds tool output.
 */
export function formatEvent(line: string, verbose = false): string[] {
	if (!line.trim()) return [];
	// biome-ignore lint/suspicious/noExplicitAny: raw provider event, read defensively
	let e: Record<string, any>;
	try {
		e = JSON.parse(line);
	} catch {
		// stderr appended at the end of the log
		return [color.dim(line)];
	}
	const out: string[] = [];
	switch (e.type) {
		// Claude
		case "system":
			if (e.subtype === "init")
				out.push(color.dim(`session started · model ${e.model ?? "?"}`));
			break;
		case "assistant":
			for (const c of e.message?.content ?? []) {
				if (c.type === "text" && c.text?.trim()) out.push(c.text.trim());
				if (c.type === "tool_use")
					out.push(color.cyan(`→ ${c.name} ${clip(toolArg(c.input), 160)}`));
			}
			break;
		case "user":
			for (const c of e.message?.content ?? []) {
				if (c.type !== "tool_result") continue;
				if (c.is_error)
					out.push(color.red(`  ✖ ${clip(resultText(c.content), 200)}`));
				else if (verbose)
					out.push(color.dim(`  ${clip(resultText(c.content), 300)}`));
			}
			break;
		case "result": {
			const cost =
				typeof e.total_cost_usd === "number"
					? ` · $${e.total_cost_usd.toFixed(2)}`
					: "";
			const took = e.duration_ms ? ` · ${duration(e.duration_ms)}` : "";
			const turns = e.num_turns ? ` · ${e.num_turns} turns` : "";
			const done = `${e.is_error ? "✖" : "✔"} ${e.subtype ?? "done"}${took}${turns}${cost}`;
			out.push(e.is_error ? color.red(done) : color.green(done));
			if (e.is_error && e.result) out.push(color.red(clip(e.result, 500)));
			break;
		}
		// Codex
		case "thread.started":
			out.push(color.dim("session started"));
			break;
		case "item.started":
			if (e.item?.type === "command_execution")
				out.push(color.cyan(`→ $ ${clip(e.item.command ?? "", 160)}`));
			break;
		case "item.completed": {
			const it = e.item ?? {};
			if (it.type === "agent_message" && it.text?.trim())
				out.push(it.text.trim());
			if (it.type === "reasoning" && verbose && it.text)
				out.push(color.dim(clip(it.text, 300)));
			if (it.type === "command_execution") {
				if (it.exit_code)
					out.push(
						color.red(
							`  ✖ exit ${it.exit_code} ${clip(it.aggregated_output ?? "", 200)}`,
						),
					);
				else if (verbose && it.aggregated_output)
					out.push(color.dim(`  ${clip(it.aggregated_output, 300)}`));
			}
			if (it.type === "file_change")
				for (const c of it.changes ?? [])
					out.push(color.cyan(`→ ${c.kind ?? "edit"} ${c.path}`));
			if (it.type === "mcp_tool_call")
				out.push(color.cyan(`→ ${it.server}.${it.tool}`));
			if (it.type === "web_search")
				out.push(color.cyan(`→ search ${clip(it.query ?? "", 160)}`));
			if (it.type === "error") out.push(color.red(`✖ ${it.message}`));
			break;
		}
		case "turn.failed":
			out.push(color.red(`✖ ${e.error?.message ?? "turn failed"}`));
			break;
		case "error":
			out.push(color.red(`✖ ${e.message ?? "error"}`));
			break;
	}
	return out;
}
