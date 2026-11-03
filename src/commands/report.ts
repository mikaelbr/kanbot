import { defineCommand } from "citty";
import { LABELS, loadConfig } from "../config.ts";
import { waitingOnHuman } from "../daemon/derive.ts";
import { takeSnapshot } from "../daemon/snapshot.ts";
import { fetchActivity, signed } from "../github/api.ts";
import { Gh } from "../github/gh.ts";
import { marker } from "../github/markers.ts";
import { loadBoard, postStatusUpdate } from "../github/project.ts";
import { Trust } from "../github/trust.ts";
import { log } from "../log.ts";
import { buildReport, parseSince, renderReport } from "../report.ts";

export default defineCommand({
	meta: {
		name: "report",
		description:
			"Show flow metrics: merged PRs, cycle time, wait on you, fix loops, needs-human causes",
	},
	args: {
		since: {
			type: "string",
			description: "Start of the period: 7d, 2w, 12h or YYYY-MM-DD",
			default: "7d",
		},
		post: {
			type: "boolean",
			description: "Also post it to the board's Status updates",
			default: false,
		},
		json: {
			type: "boolean",
			description: "Print JSON instead of text",
			default: false,
		},
	},
	async run({ args }) {
		const since = parseSince(args.since);
		const config = await loadConfig(process.cwd());
		const gh = new Gh(config.repo);
		const board = await loadBoard(gh, config);

		const [activity, snapshot] = await Promise.all([
			fetchActivity(gh, since),
			takeSnapshot(gh, board, new Trust(gh)),
		]);
		const open = snapshot.items.filter(
			(i) => i.issue.state === "OPEN" && i.column !== "done",
		);
		const report = buildReport(
			activity,
			{
				waiting: waitingOnHuman(snapshot, config).length,
				limit: config.wip.awaitingHuman,
				needsHuman: open.filter((i) =>
					i.issue.labels.includes(LABELS.needsHuman),
				).length,
				active: open.length,
			},
			since,
		);

		const text = renderReport(report);
		console.log(args.json ? JSON.stringify(report, null, 2) : text);

		if (args.post) {
			await postStatusUpdate(gh, board, {
				body: `${signed(gh, text)}\n\n${marker("report")}`,
				status: report.health,
				startDate: report.since.slice(0, 10),
			});
			if (!args.json) log.info(`Posted to Status updates: ${board.url}`);
		}
	},
});
