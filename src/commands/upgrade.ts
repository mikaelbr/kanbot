import { existsSync } from "node:fs";
import { defineCommand } from "citty";
import pkg from "../../package.json" with { type: "json" };
import { loadAgents } from "../agents/load.ts";
import { sync } from "../agents/sync.ts";
import { legacyCapabilities } from "../capabilities.ts";
import {
	configPath,
	loadConfig,
	saveConfig,
	writeConfigSchema,
} from "../config.ts";
import { log } from "../log.ts";
import {
	applyUpgrade,
	type Change,
	NEW_SUFFIX,
	planUpgrade,
	readManifest,
} from "../templates.ts";

const HEADINGS: Record<Change["action"], string> = {
	add: "Added",
	update: "Updated",
	conflict: `You edited these; kanbot's new version is next to each as *${NEW_SUFFIX}`,
	deleted: "You deleted these; left out",
	removed: "No longer shipped by kanbot; left in place",
};

export default defineCommand({
	meta: {
		name: "upgrade",
		description:
			"Update kanbot's agents, skills and workflows in this repo, keeping your edits",
	},
	args: {
		"dry-run": {
			type: "boolean",
			description: "Show what would change without writing",
			default: false,
		},
	},
	async run({ args }) {
		const root = process.cwd();
		const from = (await readManifest(root))?.version ?? "no manifest";
		const plan = await planUpgrade(root);
		log.info(`kanbot ${from} → ${pkg.version}`);
		for (const action of Object.keys(HEADINGS) as Change["action"][]) {
			const paths = plan.changes
				.filter((c) => c.action === action)
				.map((c) => c.path);
			if (paths.length)
				console.log(
					`\n${HEADINGS[action]}:\n${paths.map((p) => `  ${p}`).join("\n")}`,
				);
		}
		if (!plan.changes.length) log.info("Templates are up to date.");
		const caps = existsSync(configPath(root))
			? legacyCapabilities(root, (await loadConfig(root)).capabilities)
			: null;
		if (caps)
			console.log(
				`\nMapped skills you have to capabilities in .kanbot/config.yml:\n${Object.entries(
					caps,
				)
					.map(([n, c]) => `  ${n}: ${c.use}`)
					.join("\n")}`,
			);
		if (args["dry-run"]) return;

		await applyUpgrade(root, plan);
		if (caps) await saveConfig(root, { capabilities: caps });
		const generated = await sync(root, await loadAgents(root));
		if (await writeConfigSchema(root))
			generated.push(".kanbot/config.schema.json");
		for (const f of generated) log.info(`~ ${f} (generated)`);

		const conflicts = plan.changes.some((c) => c.action === "conflict");
		console.log(`
Next steps:
  ${
		conflicts
			? `1. Merge each *${NEW_SUFFIX} file into the file next to it, then delete it.
     Ask your agent: "use kanbot-admin to merge the kanbot upgrade".
  2. `
			: "1. "
	}Review the diff and commit. Changes are not committed for you.`);
	},
});
