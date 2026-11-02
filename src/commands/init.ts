import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { loadAgents } from "../agents/load.ts";
import { sync } from "../agents/sync.ts";
import { askCapabilities, compact, ownWorkers } from "../capabilities.ts";
import { configPath, saveConfig, writeConfigSchema } from "../config.ts";
import { DOCS_URL, UserError } from "../errors.ts";
import { run } from "../github/gh.ts";
import { log } from "../log.ts";
import { applyUpgrade, NEW_SUFFIX, planUpgrade } from "../templates.ts";

const GITIGNORE = [".kanbot/state.json", ".kanbot/logs/", ".kanbot/daemon.pid"];

export default defineCommand({
	meta: {
		name: "init",
		description:
			"Scaffold kanbot agents, skills and GitHub files into this repo",
	},
	args: {
		provider: {
			type: "enum",
			options: ["claude", "codex"],
			description: "Agent provider",
			default: "claude",
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
		if (!["claude", "codex"].includes(args.provider))
			throw new UserError(`Unknown provider "${args.provider}".`, {
				fix: "kanbot init --provider claude|codex",
				docs: "providers#choose-a-provider",
				more: "",
			});

		// Fail on gh or remote problems before writing anything.
		const repo =
			!existsSync(configPath(root)) || args.force
				? (JSON.parse(
						await run([
							"repo",
							"view",
							"--json",
							"nameWithOwner,defaultBranchRef",
						]),
					) as { nameWithOwner: string; defaultBranchRef: { name: string } })
				: null;

		const plan = await planUpgrade(root, { force: args.force });
		await applyUpgrade(root, plan);
		for (const c of plan.changes) {
			if (c.action === "add" || c.action === "update") log.info(`+ ${c.path}`);
			if (c.action === "conflict")
				log.warn(
					`! ${c.path} exists; kanbot's version is in ${c.path}${NEW_SUFFIX}`,
				);
		}
		log.info("+ .kanbot/manifest.json");

		if (repo) {
			await saveConfig(root, {
				provider: args.provider as "claude" | "codex",
				repo: repo.nameWithOwner,
				baseBranch: repo.defaultBranchRef.name,
			});
			log.info(
				`+ .kanbot/config.yml (${repo.nameWithOwner}, base ${repo.defaultBranchRef.name})`,
			);
			// Only ask when someone can answer.
			if (process.stdin.isTTY) {
				const caps = askCapabilities(await ownWorkers(root), prompt);
				if (Object.keys(caps).length) {
					await saveConfig(root, { capabilities: compact(caps) } as never);
					log.info(
						`~ .kanbot/config.yml (capabilities: ${Object.keys(caps).join(", ")})`,
					);
				}
			}
		}

		const codeowners = join(root, ".github", "CODEOWNERS");
		if (!existsSync(codeowners)) {
			const login = (await run(["api", "user", "--jq", ".login"])).trim();
			await Bun.write(
				codeowners,
				`# Human reviewers. kanbot acts as your account, so this documents ownership\n# rather than triggering review requests for your own PRs.\n* @${login}\n`,
			);
			log.info(`+ .github/CODEOWNERS (@${login})`);
		}

		await appendGitignore(root);
		const changed = await sync(root, await loadAgents(root));
		if (await writeConfigSchema(root))
			changed.push(".kanbot/config.schema.json");
		for (const f of changed) log.info(`~ ${f} (generated)`);

		console.log(`
Next steps:
  1. Review AGENTS.md and fill in .agents/skills/project-conventions/SKILL.md
     (ask your agent to draft it; see ${DOCS_URL}/project-conventions)
  2. Adjust .github/workflows/ci.yml to your stack (agents fix failing CI)
  3. Map your own skills under capabilities in .kanbot/config.yml (kanbot-guide can help)
  4. kanbot board create        # board and labels; enable the workflows it prints
  5. Commit and push these files to the default branch (agents work from it)
  6. kanbot doctor              # checks auth, board, generated files
  7. kanbot run                 # start the loop (or kanbot run --once --dry-run)`);
	},
});

async function appendGitignore(root: string) {
	const path = join(root, ".gitignore");
	const current = existsSync(path) ? await Bun.file(path).text() : "";
	const missing = GITIGNORE.filter((l) => !current.split("\n").includes(l));
	if (!missing.length) return;
	const sep = current && !current.endsWith("\n") ? "\n" : "";
	await Bun.write(path, `${current}${sep}\n# kanbot\n${missing.join("\n")}\n`);
	log.info("~ .gitignore");
}
