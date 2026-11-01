import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { defineCommand } from "citty";
import { log } from "../log.ts";
import { listTemplates } from "../templates.ts";

/** Skills that work outside a kanbot repo, so they can be installed per user. */
export const GLOBAL_SKILLS = ["kanbot-idea", "kanbot-guide"];

/** User-level skill folders: Claude Code reads the first, Codex the second. */
export const globalSkillDirs = (home = homedir()) => ({
	claude: join(home, ".claude", "skills"),
	codex: join(home, ".agents", "skills"),
});

export async function installGlobal(
	providers: ("claude" | "codex")[],
	home = homedir(),
) {
	const dirs = globalSkillDirs(home);
	const templates = await listTemplates();
	const written: string[] = [];
	for (const [path, content] of templates) {
		const m = path.match(/^\.agents\/skills\/([^/]+)\/(.+)$/);
		if (!m?.[1] || !m[2] || !GLOBAL_SKILLS.includes(m[1])) continue;
		for (const p of providers) {
			const to = join(dirs[p], m[1], m[2]);
			await mkdir(dirname(to), { recursive: true });
			await Bun.write(to, content);
			written.push(to);
		}
	}
	return written;
}

const install = defineCommand({
	meta: {
		name: "install",
		description: `Install ${GLOBAL_SKILLS.join(", ")} for your user, to use from any directory`,
	},
	args: {
		provider: {
			type: "enum",
			options: ["claude", "codex", "both"],
			description: "Which agent CLI to install for",
			default: "both",
		},
	},
	async run({ args }) {
		const providers =
			args.provider === "both"
				? (["claude", "codex"] as const)
				: [args.provider as "claude" | "codex"];
		for (const f of await installGlobal([...providers])) log.info(`+ ${f}`);
		log.info("Rerun after upgrading kanbot to get the latest version.");
	},
});

export default defineCommand({
	meta: { name: "skills", description: "Manage kanbot skills" },
	subCommands: { install },
});
