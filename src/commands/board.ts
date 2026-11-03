import { defineCommand } from "citty";
import { type Config, LABELS, loadConfig, saveConfig } from "../config.ts";
import { UserError } from "../errors.ts";
import { ensureCopilotRuleset, ensureLabel } from "../github/api.ts";
import { Gh } from "../github/gh.ts";
import {
	type Board,
	createBoard,
	loadBoard,
	missingColumns,
	neededWorkflows,
	workflowsUrl,
} from "../github/project.ts";
import { log } from "../log.ts";

export const REPO_LABELS: [name: string, color: string, description: string][] =
	[
		[
			LABELS.technical,
			"5319e7",
			"Technical work; planned as a technical goal instead of a user story",
		],
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
			LABELS.review,
			"5319e7",
			"Have kanbot agents review this PR, without a board card",
		],
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

/**
 * Creates the board (or keeps the configured one), labels and Copilot
 * ruleset, then prints the workflows to turn on. Returns the board, or null
 * if creation was skipped.
 */
export async function setupBoard(root: string, title?: string) {
	const config = await loadConfig(root);
	const gh = new Gh(config.repo);
	if (config.project) {
		log.info(
			`Project already configured (${config.project.owner} #${config.project.number}); only ensuring labels.`,
		);
	} else {
		const project = await createBoard(gh, config, title ?? gh.name);
		if (!project) return null;
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
	warnMissing(board);
	printWorkflows(config, board);
	return board;
}

/** Saves an existing project as the board and adds the labels. */
export async function linkBoard(root: string, owner: string, number: number) {
	await saveConfig(root, { project: { owner, number } });
	const config = await loadConfig(root);
	const gh = new Gh(config.repo);
	const board = await loadBoard(gh, config);
	await ensureLabels(gh);
	log.info(`Linked ${board.url}`);
	warnMissing(board);
	return board;
}

function warnMissing(board: Board) {
	const missing = missingColumns(board);
	if (missing.length)
		log.warn(
			`Board is missing columns: ${missing.join(", ")} — add them to the Status field.`,
		);
}

export function printWorkflows(config: Config, board: Board) {
	const steps = neededWorkflows(config).map(
		(w) => `  • ${w.name.padEnd(21)} → ${w.set}`,
	);
	console.log(`
Turn on these built-in workflows. GitHub's API can't, so do it here:
${workflowsUrl(board)}
${steps.join("\n")}`);
}

/** Owner and number from a project URL like github.com/users/<owner>/projects/<n>. */
export function parseProjectUrl(url: string) {
	const m = url.match(
		/github\.com\/(?:users|orgs)\/([^/\s]+)\/projects\/(\d+)/,
	);
	return m ? { owner: m[1] as string, number: Number(m[2]) } : null;
}

const create = defineCommand({
	meta: {
		name: "create",
		description:
			"Create a GitHub Project board for this repo with the kanbot columns and labels",
	},
	args: {
		title: {
			type: "string",
			description: "Project title (default: repo name)",
		},
	},
	async run({ args }) {
		if (await setupBoard(process.cwd(), args.title))
			console.log("Then run kanbot doctor.");
	},
});

const link = defineCommand({
	meta: {
		name: "link",
		description:
			"Use an existing project board, e.g. github.com/users/<owner>/projects/<number>",
	},
	args: {
		owner: {
			type: "string",
			required: true,
			description: "User or org login that owns the project",
		},
		number: { type: "string", required: true, description: "Project number" },
	},
	async run({ args }) {
		const number = Number(args.number);
		if (!Number.isInteger(number))
			throw new UserError("--number must be a number.", {
				why: "It's the number at the end of the project URL.",
				docs: "getting-started#create-the-board",
			});
		const config = await loadConfig(process.cwd());
		const board = await linkBoard(process.cwd(), args.owner, number);
		printWorkflows(config, board);
	},
});

export default defineCommand({
	meta: { name: "board", description: "Manage the GitHub Project board" },
	subCommands: { create, link },
});
