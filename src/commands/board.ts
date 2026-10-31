import { defineCommand } from "citty";
import { LABELS, loadConfig, saveConfig } from "../config.ts";
import { ensureCopilotRuleset, ensureLabel } from "../github/api.ts";
import { Gh } from "../github/gh.ts";
import { createBoard, loadBoard, missingColumns } from "../github/project.ts";
import { log } from "../log.ts";

export const REPO_LABELS: [name: string, color: string, description: string][] =
	[
		[
			LABELS.technical,
			"5319e7",
			"Technical work; planned as a technical goal instead of a user story",
		],
		["type:frontend", "1d76db", "User-facing UI work"],
		["type:backend", "0e8a16", "Server, data or API work"],
		["type:docs", "c5def5", "Documentation"],
		["type:infra", "bfd4f2", "Tooling, CI, infrastructure"],
		[
			"explore:2",
			"fbca04",
			"Implement 2 alternative approaches as separate PRs",
		],
		[
			"explore:3",
			"fbca04",
			"Implement 3 alternative approaches as separate PRs",
		],
		[
			"explore:4",
			"fbca04",
			"Implement 4 alternative approaches as separate PRs",
		],
		[LABELS.working, "ededed", "An kanbot agent is working on this"],
		[
			LABELS.agentReviewed,
			"0e8a16",
			"Passed both agent review passes; ready for human testing",
		],
		[
			LABELS.needsHuman,
			"d93f0b",
			"Agents stopped; remove the label to let them retry",
		],
		["variant:1", "f9d0c4", "Exploratory approach 1"],
		["variant:2", "f9d0c4", "Exploratory approach 2"],
		["variant:3", "f9d0c4", "Exploratory approach 3"],
		["variant:4", "f9d0c4", "Exploratory approach 4"],
	];

export async function ensureLabels(gh: Gh) {
	for (const [name, color, description] of REPO_LABELS)
		await ensureLabel(gh, name, color, description);
}

const create = defineCommand({
	meta: {
		name: "create",
		description:
			"Create a GitHub Project board for this repo with the kanbot columns",
	},
	args: {
		title: {
			type: "string",
			description: "Project title (default: repo name)",
		},
	},
	async run({ args }) {
		const root = process.cwd();
		const config = await loadConfig(root);
		const gh = new Gh(config.repo);
		if (config.project) {
			log.info(
				`Project already configured (${config.project.owner} #${config.project.number}); only ensuring labels.`,
			);
		} else {
			const project = await createBoard(gh, config, args.title ?? gh.name);
			if (!project) return;
			await saveConfig(root, {
				project: { owner: project.owner, number: project.number },
			});
			log.info(`Created project ${project.url}`);
		}
		await ensureLabels(gh);
		log.info(`Labels ensured: ${REPO_LABELS.map(([n]) => n).join(", ")}`);
		if (config.review.copilot) {
			await ensureCopilotRuleset(gh, config.review.copilotOnPush);
			log.info("Copilot review ruleset ensured.");
		}
		const board = await loadBoard(gh, await loadConfig(root));
		const missing = missingColumns(board);
		if (missing.length)
			log.warn(
				`Board is missing columns: ${missing.join(", ")} — add them to the Status field.`,
			);
		console.log(`
Enable these built-in project workflows (Project → ⋯ → Workflows), they can't be set via the API:
  • Item closed           → set Status: ${config.columns.done}
  • Pull request merged   → set Status: ${config.columns.done}
  • Auto-add to project   → filter is:issue repo:${config.repo}   (new issues land in the board)
  • Item added to project → set Status: ${config.columns.ideas}
${board.url}`);
	},
});

const link = defineCommand({
	meta: { name: "link", description: "Use an existing project board" },
	args: {
		owner: {
			type: "string",
			required: true,
			description: "User or org login that owns the project",
		},
		number: { type: "string", required: true, description: "Project number" },
	},
	async run({ args }) {
		const root = process.cwd();
		await saveConfig(root, {
			project: { owner: args.owner, number: Number(args.number) },
		});
		const config = await loadConfig(root);
		const board = await loadBoard(new Gh(config.repo), config);
		const missing = missingColumns(board);
		log.info(
			missing.length
				? `Linked, but missing columns: ${missing.join(", ")}`
				: `Linked ${board.url}`,
		);
	},
});

export default defineCommand({
	meta: { name: "board", description: "Manage the GitHub Project board" },
	subCommands: { create, link },
});
