import { defineCommand } from "citty";
import { color } from "../color.ts";
import { type Config, loadConfig, saveConfig } from "../config.ts";
import { UserError } from "../errors.ts";
import { log } from "../log.ts";
import { LOGIN_FIX, providerLogin } from "../providers/login.ts";

export const PROVIDERS = ["claude", "codex"] as const;

/** Sets the provider in config. Returns false if it was already set. */
export async function setProvider(root: string, provider: Config["provider"]) {
	const config = await loadConfig(root);
	if (config.provider === provider) return false;
	await saveConfig(root, { provider });
	return true;
}

export default defineCommand({
	meta: {
		name: "provider",
		description:
			"Show the agent provider, or switch it: kanbot provider claude|codex",
	},
	args: {
		name: {
			type: "positional",
			required: false,
			description: "Provider to switch to: claude or codex",
		},
	},
	async run({ args }) {
		const root = process.cwd();
		const name = args.name as Config["provider"] | undefined;
		if (!name) {
			const config = await loadConfig(root);
			console.log(`provider: ${color.bold(config.provider)}`);
			const other = config.provider === "claude" ? "codex" : "claude";
			console.log(color.dim(`Switch: kanbot provider ${other}`));
			return;
		}
		if (!PROVIDERS.includes(name))
			throw new UserError(`Unknown provider "${name}".`, {
				fix: `kanbot provider ${PROVIDERS.join("|")}`,
				docs: "providers#choose-a-provider",
			});
		if (!(await setProvider(root, name))) {
			log.info(`Already using ${name}.`);
			return;
		}
		log.info(`~ .kanbot/config.yml (provider: ${name})`);
		const login = await providerLogin(name);
		if (!login.ok)
			log.warn(
				`${name} is ${login.installed ? "not logged in with a subscription" : "not installed"}. Run: ${LOGIN_FIX[name]}`,
			);
		log.info(
			"Next: run `kanbot doctor`, then commit and push .kanbot/config.yml. The daemon switches after the push.",
		);
	},
});
