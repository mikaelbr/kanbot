import { defineCommand } from "citty";
import { loadAgents } from "../agents/load.ts";
import { sync } from "../agents/sync.ts";
import { log } from "../log.ts";

export default defineCommand({
	meta: {
		name: "sync",
		description:
			"Generate .claude/agents, .codex/agents and permissions from .autogh/agents",
	},
	args: {
		check: {
			type: "boolean",
			description: "Exit 1 if generated files are stale",
			default: false,
		},
	},
	async run({ args }) {
		const root = process.cwd();
		const changed = await sync(root, await loadAgents(root), {
			check: args.check,
		});
		if (!changed.length)
			return log.info("Generated agent files are up to date.");
		for (const f of changed) log.info(`${args.check ? "stale" : "wrote"} ${f}`);
		if (args.check) process.exit(1);
	},
});
