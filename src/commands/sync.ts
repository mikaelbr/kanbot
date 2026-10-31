import { defineCommand } from "citty";
import { loadAgents } from "../agents/load.ts";
import { sync } from "../agents/sync.ts";
import { writeConfigSchema } from "../config.ts";
import { log } from "../log.ts";

export default defineCommand({
	meta: {
		name: "sync",
		description:
			"Generate .claude/agents, .codex/agents, permissions and the config schema",
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
		if (await writeConfigSchema(root, { check: args.check }))
			changed.push(".kanbot/config.schema.json");
		if (!changed.length) return log.info("Generated files are up to date.");
		for (const f of changed) log.info(`${args.check ? "stale" : "wrote"} ${f}`);
		if (args.check) process.exit(1);
	},
});
