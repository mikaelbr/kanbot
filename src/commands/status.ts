import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { color } from "../color.ts";
import { COLUMN_KEYS, loadConfig } from "../config.ts";
import { waitingOnHuman, wipFull } from "../daemon/derive.ts";
import { takeSnapshot } from "../daemon/snapshot.ts";
import { State } from "../daemon/state.ts";
import { Gh } from "../github/gh.ts";
import { listItems, loadBoard } from "../github/project.ts";
import { Trust } from "../github/trust.ts";
import {
	listRuns,
	type Run,
	runLine,
	runProblems,
	runStatus,
} from "../runs.ts";
import { pickRunning, showRun } from "./logs.ts";

/** Short age like `5m`, `3h` or `2d`. */
export function age(since: string, now = Date.now()) {
	const m = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000));
	if (m < 60) return `${m}m`;
	if (m < 60 * 24) return `${Math.floor(m / 60)}h`;
	return `${Math.floor(m / (60 * 24))}d`;
}

/** Up to the last two problems of a running agent, under its run line. */
export function problemLines(run: Run, problems: string[]): string[] {
	if (!problems.length) return [];
	const n = problems.length;
	const head = `${n} ${n === 1 ? "error" : "errors"} so far`;
	return [
		color.red(`    ✖ ${head}${n > 2 ? ", last two:" : ":"}`),
		...problems.slice(-2).map((p) => color.red(`      ${p}`)),
		color.dim(`      See all: kanbot logs ${run.key}`),
	];
}

export default defineCommand({
	meta: {
		name: "status",
		description:
			"Show board columns, what waits on you, daemon state and failures",
	},
	args: {
		follow: {
			type: "boolean",
			alias: "f",
			description:
				"Then follow a running agent's log; asks which if several run",
			default: false,
		},
	},
	async run({ args }) {
		const root = process.cwd();
		const config = await loadConfig(root);
		const gh = new Gh(config.repo);
		const board = await loadBoard(gh, config);
		const items = await listItems(gh, board);

		const pidFile = join(root, ".kanbot", "daemon.pid");
		const pid = existsSync(pidFile)
			? (await Bun.file(pidFile).text()).trim()
			: null;
		console.log(
			`${config.repo} · ${board.url}\ndaemon: ${pid ? `pid ${pid}` : "not running"} · provider ${config.provider}\n`,
		);

		for (const key of COLUMN_KEYS) {
			const inCol = items.filter(
				(i) => i.column === key && (key === "done" || i.state === "OPEN"),
			);
			const shown =
				key === "done"
					? `${inCol.length}`
					: inCol.map((i) => `#${i.number}`).join(" ") || "—";
			console.log(`${config.columns[key].padEnd(12)} ${shown}`);
		}

		const running = (await listRuns(root)).filter(
			(r) => runStatus(r) === "running",
		);
		if (running.length) {
			console.log("\nrunning:");
			for (const r of running) {
				console.log(`  ${runLine(r)}`);
				const lines = problemLines(r, await runProblems(root, r));
				if (lines.length) console.log(lines.join("\n"));
			}
			if (!args.follow)
				console.log("  Follow one: kanbot status -f, or kanbot logs <key> -f");
		}

		const snapshot = await takeSnapshot(gh, board, new Trust(gh), {
			listed: items,
		});
		const waiting = waitingOnHuman(snapshot, config);
		if (waiting.length) {
			const rows = waiting.map(({ item, why, url, since }) => {
				const ago = since ? age(since) : "?";
				return `  ${ago.padStart(4)}  #${item.issue.number} ${why} · ${item.issue.title}\n        ${url}`;
			});
			const limit = config.wip.awaitingHuman;
			console.log(
				`\nwaiting on you${limit === null ? "" : ` (${waiting.length}/${limit})`}:\n${rows.join("\n")}`,
			);
		}
		if (wipFull(snapshot, config).full) {
			console.log(
				"WIP limit reached: no new Ready cards start until you clear some.",
			);
		}

		const state = await new State(root).load();
		if (state.failures.size) {
			console.log(
				`\nfailures:\n${[...state.failures].map(([k, n]) => `  ${k}: ${n}`).join("\n")}`,
			);
		}
		if (state.pausedUntil > Date.now()) {
			console.log(
				`\npaused (rate limit) until ${new Date(state.pausedUntil).toLocaleString()}`,
			);
		}

		if (args.follow) {
			console.log();
			await showRun(root, pickRunning(running), {
				follow: true,
				raw: false,
				verbose: false,
			});
		}
	},
});
