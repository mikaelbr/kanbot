import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { COLUMN_KEYS, LABELS, loadConfig } from "../config.ts";
import { State } from "../daemon/state.ts";
import { Gh, run } from "../github/gh.ts";
import { listItems, loadBoard } from "../github/project.ts";

export default defineCommand({
	meta: {
		name: "status",
		description: "Show board columns, daemon state and failures",
	},
	async run() {
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

		const needsHuman = JSON.parse(
			await run([
				"issue",
				"list",
				"--repo",
				config.repo,
				"--label",
				LABELS.needsHuman,
				"--json",
				"number,title",
			]),
		) as { number: number; title: string }[];
		if (needsHuman.length) {
			console.log(
				`\nneeds-human:\n${needsHuman.map((i) => `  #${i.number} ${i.title}`).join("\n")}`,
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
	},
});
