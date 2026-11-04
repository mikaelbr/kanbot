import { defineCommand } from "citty";
import { type Ask, choose } from "../ask.ts";
import { color } from "../color.ts";
import { UserError } from "../errors.ts";
import {
	findRuns,
	formatEvent,
	listRuns,
	logPath,
	metaPath,
	type Run,
	runLine,
	runStatus,
} from "../runs.ts";

const ask: Ask = (q) => prompt(q);

export type ShowOpts = { follow: boolean; raw: boolean; verbose: boolean };

/** Print a run's transcript; with `follow`, keep printing until it ends. */
export async function showRun(root: string, run: Run, opts: ShowOpts) {
	const path = logPath(root, run.id);
	const print = (line: string) => {
		if (opts.raw) {
			if (line) console.log(line);
			return;
		}
		for (const l of formatEvent(line, opts.verbose)) console.log(l);
	};
	console.log(color.bold(`${run.key} · ${run.agent} (${run.provider})`));

	let offset = 0;
	let rest = "";
	const drain = async () => {
		// A fresh handle each time: Bun caches a file's size.
		const file = Bun.file(path);
		if (!(await file.exists())) return;
		const size = file.size;
		if (size <= offset) return;
		rest += await file.slice(offset, size).text();
		offset = size;
		const lines = rest.split("\n");
		rest = lines.pop() ?? "";
		for (const l of lines) print(l);
	};

	await drain();
	if (opts.follow && runStatus(run) === "running") {
		console.log(color.dim("Following. Ctrl-C to stop."));
		const meta = Bun.file(metaPath(root, run.id));
		for (;;) {
			await Bun.sleep(500);
			await drain();
			const now: Run = await meta.json().catch(() => run);
			if (runStatus(now) !== "running") {
				run = now;
				break;
			}
		}
		await drain();
	}
	if (rest) print(rest);
	const status = runStatus(run);
	if (status === "running")
		console.log(color.dim(`Still running. Follow: kanbot logs ${run.key} -f`));
	else if (run.error) console.log(color.red(`✖ ${run.outcome}: ${run.error}`));
	else if (status === "cut off")
		console.log(color.yellow("The daemon stopped before this run ended."));
}

/** Pick one of several running agents; asks when interactive. */
export function pickRunning(running: Run[]): Run {
	const [first] = running;
	if (!first)
		throw new UserError("No agent is running.", {
			why: "Agents run while `kanbot run` works on a card.",
			fix: "See past runs with `kanbot logs`, or start the daemon with `kanbot run`.",
			docs: "usage#kanbot-logs",
			more: "",
		});
	if (running.length === 1) return first;
	if (!process.stdin.isTTY)
		throw new UserError(`${running.length} agents are running.`, {
			fix: `Name one: ${running.map((r) => `kanbot logs ${r.key} -f`).join(", ")}`,
			more: "",
		});
	return choose(
		ask,
		console.log,
		"Which agent?",
		running.map((r) => ({
			value: r,
			label: r.key,
			hint: `${r.agent}, started ${new Date(r.startedAt).toLocaleTimeString()}`,
		})),
	);
}

export default defineCommand({
	meta: {
		name: "logs",
		description:
			"List recent agent runs, or show and follow one run's transcript",
	},
	args: {
		run: {
			type: "positional",
			required: false,
			description: "Job key, issue or PR number (12, #12, pr34) or run id",
		},
		follow: {
			type: "boolean",
			alias: "f",
			description:
				"Keep printing while the run goes on. Without a run, picks a running agent",
			default: false,
		},
		limit: {
			type: "string",
			alias: "n",
			description: "How many runs to list",
			default: "20",
		},
		raw: {
			type: "boolean",
			description: "Print the raw JSONL transcript",
			default: false,
		},
		verbose: {
			type: "boolean",
			alias: "v",
			description: "Also show tool output and reasoning",
			default: false,
		},
	},
	async run({ args }) {
		const root = process.cwd();
		const runs = await listRuns(root);
		const opts: ShowOpts = {
			follow: args.follow,
			raw: args.raw,
			verbose: args.verbose,
		};

		if (args.run) {
			const found = findRuns(runs, String(args.run));
			const run =
				found.find((r) => runStatus(r) === "running") ?? found[0] ?? null;
			if (!run)
				throw new UserError(`No agent run matches "${args.run}".`, {
					fix: "List runs with `kanbot logs`, then pass a job key such as `implement:#12`, an issue number or a PR number like `pr34`.",
					docs: "usage#kanbot-logs",
					more: "",
				});
			return showRun(root, run, opts);
		}

		if (args.follow) {
			const running = runs.filter((r) => runStatus(r) === "running");
			return showRun(root, pickRunning(running), opts);
		}

		if (!runs.length) {
			console.log(
				"No agent runs yet. They show up here once `kanbot run` starts work.",
			);
			return;
		}
		const limit = Math.max(1, Number.parseInt(args.limit, 10) || 20);
		for (const r of runs.slice(0, limit)) console.log(runLine(r));
		if (runs.length > limit)
			console.log(color.dim(`…and ${runs.length - limit} more (-n to show)`));
		console.log(
			color.dim(
				"\nShow one: kanbot logs <key|#issue|prN>. Follow a running agent: kanbot logs -f",
			),
		);
	},
});
