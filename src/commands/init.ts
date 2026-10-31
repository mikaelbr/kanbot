import { existsSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { defineCommand } from "citty";
import { loadAgents } from "../agents/load.ts";
import { sync } from "../agents/sync.ts";
import { configPath, saveConfig, writeConfigSchema } from "../config.ts";
import { run } from "../github/gh.ts";
import { log } from "../log.ts";

const TEMPLATES = join(import.meta.dir, "..", "..", "templates");

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
			description: "Overwrite existing files",
			default: false,
		},
	},
	async run({ args }) {
		const root = process.cwd();
		if (!existsSync(join(root, ".git")))
			throw new Error("Run inside a git repository.");
		if (!["claude", "codex"].includes(args.provider))
			throw new Error("--provider must be claude or codex");

		const written = await copyTree(TEMPLATES, root, args.force);
		for (const f of written) log.info(`+ ${f}`);

		if (!existsSync(configPath(root)) || args.force) {
			const repo = JSON.parse(
				await run(["repo", "view", "--json", "nameWithOwner,defaultBranchRef"]),
			) as {
				nameWithOwner: string;
				defaultBranchRef: { name: string };
			};
			await saveConfig(root, {
				provider: args.provider as "claude" | "codex",
				repo: repo.nameWithOwner,
				baseBranch: repo.defaultBranchRef.name,
			});
			log.info(
				`+ .kanbot/config.yml (${repo.nameWithOwner}, base ${repo.defaultBranchRef.name})`,
			);
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
  2. Adjust .github/workflows/ci.yml to your stack (agents fix failing CI)
  3. kanbot board create        # creates the project board and labels
  4. kanbot doctor              # checks auth, board, generated files
  5. Commit and push these files to the default branch (agents work from it)
  6. kanbot run                 # start the loop (or kanbot run --once --dry-run)`);
	},
});

/** Copy templates without clobbering existing files. `_gitignore`-style names are not used. */
async function copyTree(
	src: string,
	dest: string,
	force: boolean,
): Promise<string[]> {
	const written: string[] = [];
	const walk = async (dir: string) => {
		for (const name of await readdir(dir)) {
			const from = join(dir, name);
			const rel = relative(src, from);
			const to = join(dest, rel);
			if ((await stat(from)).isDirectory()) {
				await walk(from);
				continue;
			}
			if (existsSync(to) && !force) continue;
			await mkdir(dirname(to), { recursive: true });
			await Bun.write(to, Bun.file(from));
			written.push(rel);
		}
	};
	await walk(src);
	return written;
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
