import type { Config } from "../config.ts";

export type Login = {
	/** The CLI is on PATH. */
	installed: boolean;
	/** Logged in with a subscription, not an API key. */
	ok: boolean;
	detail?: string;
};

async function cmd(args: string[]) {
	const p = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
	const [out, err, code] = await Promise.all([
		new Response(p.stdout).text(),
		new Response(p.stderr).text(),
		p.exited,
	]);
	return { ok: code === 0, out: `${out}${err}`.trim() };
}

/** Whether the provider's CLI is installed and logged in with a subscription. */
export async function providerLogin(
	provider: Config["provider"],
): Promise<Login> {
	if (!Bun.which(provider)) return { installed: false, ok: false };
	if (provider === "claude") {
		const s = await cmd(["claude", "auth", "status"]);
		const sub = /"authMethod":\s*"claude\.ai"/.test(s.out);
		return {
			installed: true,
			ok: s.ok && sub,
			detail: sub ? undefined : "Not using a claude.ai login.",
		};
	}
	const s = await cmd(["codex", "login", "status"]);
	return {
		installed: true,
		ok: s.ok && /ChatGPT/i.test(s.out),
		detail: s.out.split("\n")[0],
	};
}

export const LOGIN_FIX: Record<Config["provider"], string> = {
	claude: "claude auth login",
	codex: "codex login",
};
