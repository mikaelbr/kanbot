import { defineCommand } from "citty";
import { runDaemon } from "../daemon/loop.ts";
import { log } from "../log.ts";

export default defineCommand({
	meta: { name: "run", description: "Run the autogh loop for this repo" },
	args: {
		once: {
			type: "boolean",
			description: "Run a single tick, wait for its jobs, exit",
			default: false,
		},
		"dry-run": {
			type: "boolean",
			description: "Print what would happen; change nothing",
			default: false,
		},
		verbose: {
			type: "boolean",
			alias: "v",
			description: "Verbose logging",
			default: false,
		},
	},
	async run({ args }) {
		log.verbose = args.verbose;
		await runDaemon(process.cwd(), {
			once: args.once || args["dry-run"],
			dryRun: args["dry-run"],
		});
	},
});
