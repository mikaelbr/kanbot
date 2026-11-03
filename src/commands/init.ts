import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { loadAgents } from "../agents/load.ts";
import { sync } from "../agents/sync.ts";
import { type Ask, confirm, openBrowser, type Say } from "../ask.ts";
import { askCapabilities, compact, ownWorkers } from "../capabilities.ts";
import { color } from "../color.ts";
import {
	type Config,
	configPath,
	loadConfig,
	saveConfig,
	writeConfigSchema,
} from "../config.ts";
import { DOCS_URL, describeError, UserError } from "../errors.ts";
import { run } from "../github/gh.ts";
import { workflowsUrl } from "../github/project.ts";
import { log } from "../log.ts";
import { LOGIN_FIX, providerLogin } from "../providers/login.ts";
import {
	askBoard,
	askIdentity,
	askMerge,
	askOptions,
	askProvider,
} from "../setup.ts";
import {
	applyUpgrade,
	type Change,
	NEW_SUFFIX,
	planUpgrade,
} from "../templates.ts";
import { createApp } from "./app.ts";
import {
	linkBoard,
	parseProjectUrl,
	printWorkflows,
	setupBoard,
} from "./board.ts";

const GITIGNORE = [".kanbot/state.json", ".kanbot/logs/", ".kanbot/daemon.pid"];

const ask: Ask = (q) => prompt(q);
const say: Say = (l) => console.log(l);
const step = (title: string) =>
	console.log(`\n${color.bold(color.cyan(title))}`);

export default defineCommand({
	meta: {
		name: "init",
		description:
			"Set up kanbot in this repo: pick a provider and options, add agents, skills and GitHub files, and create the board",
	},
	args: {
		provider: {
			type: "enum",
			options: ["claude", "codex"],
			description:
				"Agent provider (default: ask, or claude without a terminal)",
		},
		yes: {
			type: "boolean",
			description: "Don't ask; use defaults and set up the board later",
			default: false,
		},
		force: {
			type: "boolean",
			description: "Overwrite existing files, including your edits",
			default: false,
		},
	},
	async run({ args }) {
		const root = process.cwd();
		if (!existsSync(join(root, ".git")))
			throw new UserError("Not a git repository.", {
				why: `No .git in ${root}. Run init from the repo root.`,
				fix: "cd into your repo's root, or run `git init`.",
				docs: "getting-started#set-up-a-repository",
				more: "",
			});
		if (args.provider && !["claude", "codex"].includes(args.provider))
			throw new UserError(`Unknown provider "${args.provider}".`, {
				fix: "kanbot init --provider claude|codex",
				docs: "providers#choose-a-provider",
				more: "",
			});
		// Only ask when someone can answer.
		const interactive = !!process.stdin.isTTY && !args.yes;
		const fresh = !existsSync(configPath(root)) || args.force;

		// Fail on gh or remote problems before writing anything.
		const repo = fresh
			? (JSON.parse(
					await run([
						"repo",
						"view",
						"--json",
						"nameWithOwner,defaultBranchRef",
					]),
				) as { nameWithOwner: string; defaultBranchRef: { name: string } })
			: null;

		if (interactive)
			say(
				`${color.bold("kanbot init")} ${color.dim(
					repo
						? `sets up ${repo.nameWithOwner}. Press Enter to take the default.`
						: "updates files and asks about what isn't set up yet.",
				)}`,
			);

		let provider = args.provider as Config["provider"] | undefined;
		if (!provider && repo && interactive) {
			step("Provider");
			provider = askProvider(ask, say, {
				claude: await providerLogin("claude"),
				codex: await providerLogin("codex"),
			});
		}

		if (interactive) step("Files");
		const plan = await planUpgrade(root, { force: args.force });
		await applyUpgrade(root, plan);
		printChanges(plan.changes);
		if (repo) {
			await saveConfig(root, {
				provider: provider ?? "claude",
				repo: repo.nameWithOwner,
				baseBranch: repo.defaultBranchRef.name,
			});
			log.info(
				`+ .kanbot/config.yml (${repo.nameWithOwner}, base ${repo.defaultBranchRef.name})`,
			);
		}
		await writeCodeowners(root);
		await appendGitignore(root);
		const changed = await sync(root, await loadAgents(root));
		if (await writeConfigSchema(root))
			changed.push(".kanbot/config.schema.json");
		printGrouped(changed, "~", "generated");

		const config = await loadConfig(root);
		const login = await providerLogin(config.provider);
		if (!login.ok)
			log.warn(
				`${config.provider} is ${login.installed ? "not logged in with a subscription" : "not installed"}. Run: ${LOGIN_FIX[config.provider]}`,
			);

		let workflowsShown = false;
		if (interactive) {
			if (repo) {
				step("GitHub identity");
				const identity = askIdentity(ask, say);
				if (identity === "app")
					await tryStep(() => createApp(root), "kanbot app create");
				const merge = askMerge(ask, say, identity);
				if (merge.onApproval)
					await saveConfig(root, { merge: merge as Config["merge"] });

				step("Options");
				const options = askOptions(ask, say, config.provider);
				if (Object.keys(options).length) await saveConfig(root, options);
			}

			const workers = await ownWorkers(root);
			if (workers.length && !Object.keys(config.capabilities).length) {
				step("Capabilities");
				const caps = askCapabilities(workers, ask, say);
				if (Object.keys(caps).length) {
					await saveConfig(root, { capabilities: compact(caps) } as never);
					log.info(
						`~ .kanbot/config.yml (capabilities: ${Object.keys(caps).join(", ")})`,
					);
				}
			}

			if (!config.project) {
				step("Board");
				workflowsShown = await boardStep(root);
			}
		}

		const { project } = await loadConfig(root);
		const next = [
			`Review AGENTS.md and fill in .agents/skills/project-conventions/SKILL.md
     (ask your agent to draft it; see ${DOCS_URL}/project-conventions)`,
			"Adjust .github/workflows/ci.yml to your stack (agents fix failing CI)",
			...(interactive
				? []
				: [
						"Map your own skills under capabilities in .kanbot/config.yml (kanbot-guide can help)",
					]),
			...(workflowsShown
				? ["Turn on the board workflows listed above"]
				: project
					? []
					: [
							"kanbot board create        # board and labels; enable the workflows it prints",
						]),
			"Commit and push these files to the default branch (agents work from it)",
			"kanbot doctor              # checks auth, board, generated files",
			"kanbot run                 # start the loop (or kanbot run --once --dry-run)",
		];
		console.log(
			`\n${color.bold("Next steps:")}\n${next.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`,
		);
	},
});

/** Lists what changed, one line per folder, and each conflict in full. */
function printChanges(changes: Change[]) {
	printGrouped(
		changes
			.filter((c) => c.action === "add" || c.action === "update")
			.map((c) => c.path),
		"+",
	);
	for (const c of changes)
		if (c.action === "conflict")
			log.warn(
				`! ${c.path} exists; kanbot's version is in ${c.path}${NEW_SUFFIX}`,
			);
	log.info("+ .kanbot/manifest.json");
}

/** One line per folder two levels deep, e.g. `+ .agents/skills/ (13 files)`. */
function printGrouped(paths: string[], mark: string, note = "") {
	const groups = new Map<string, number>();
	for (const path of paths) {
		const parts = path.split("/");
		const key = parts.length > 2 ? `${parts.slice(0, 2).join("/")}/` : path;
		groups.set(key, (groups.get(key) ?? 0) + 1);
	}
	for (const [path, n] of groups) {
		const notes = [n > 1 ? `${n} files` : "", note].filter(Boolean);
		log.info(`${mark} ${path}${notes.length ? ` (${notes.join(", ")})` : ""}`);
	}
}

/** Runs a step that may fail without stopping init. */
async function tryStep(fn: () => Promise<unknown>, retry: string) {
	try {
		await fn();
		return true;
	} catch (e) {
		const d = describeError(e);
		log.warn(`${d.message}${d.fix ? ` Fix: ${d.fix}` : ""}`);
		log.warn(`Skipped. Run \`${retry}\` later.`);
		return false;
	}
}

/** Asks how to get a board, then creates or links it. True if it printed the workflows to turn on. */
async function boardStep(root: string) {
	if (!/'project'/.test(await authStatus())) {
		say("Your gh token needs the `project` scope to manage boards.");
		if (!confirm(ask, "Run `gh auth refresh -s project` now?", true)) {
			say("  Skipped. Run it, then `kanbot board create`.");
			return false;
		}
		const p = Bun.spawn(["gh", "auth", "refresh", "-s", "project"], {
			stdio: ["inherit", "inherit", "inherit"],
		});
		if ((await p.exited) !== 0) {
			log.warn("gh auth refresh failed. Run it, then `kanbot board create`.");
			return false;
		}
	}
	const choice = askBoard(ask, say, parseProjectUrl);
	if (choice.kind === "skip") return false;
	let url = "";
	const ok = await tryStep(
		async () => {
			const board =
				choice.kind === "link"
					? await linkBoard(root, choice.owner, choice.number)
					: await setupBoard(root);
			if (!board) return;
			if (choice.kind === "link") printWorkflows(await loadConfig(root), board);
			url = workflowsUrl(board);
		},
		choice.kind === "link" ? "kanbot board link" : "kanbot board create",
	);
	if (!ok || !url) return false;
	if (confirm(ask, "Open the Workflows page now?", true)) openBrowser(url);
	return true;
}

async function authStatus() {
	const p = Bun.spawn(["gh", "auth", "status"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err] = await Promise.all([
		new Response(p.stdout).text(),
		new Response(p.stderr).text(),
	]);
	await p.exited;
	return `${out}${err}`;
}

async function writeCodeowners(root: string) {
	const path = join(root, ".github", "CODEOWNERS");
	if (existsSync(path)) return;
	const login = (await run(["api", "user", "--jq", ".login"])).trim();
	await Bun.write(
		path,
		`# Human reviewers. kanbot acts as your account, so this documents ownership\n# rather than triggering review requests for your own PRs.\n* @${login}\n`,
	);
	log.info(`+ .github/CODEOWNERS (@${login})`);
}

async function appendGitignore(root: string) {
	const path = join(root, ".gitignore");
	const current = existsSync(path) ? await Bun.file(path).text() : "";
	const missing = GITIGNORE.filter((l) => !current.split("\n").includes(l));
	if (!missing.length) return;
	const sep = current && !current.endsWith("\n") ? "\n" : "";
	await Bun.write(path, `${current}${sep}\n# kanbot\n${missing.join("\n")}\n`);
	log.info("~ .gitignore");
}
