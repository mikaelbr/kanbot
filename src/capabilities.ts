import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentDef } from "./agents/load.ts";
import type { Config, RESERVED_CAPABILITIES } from "./config.ts";
import { TEMPLATES } from "./templates.ts";

export type Capabilities = Config["capabilities"];

/** Where a capability's `use` lives. `claude`/`codex` agents work on one provider only. */
export type CapabilitySource = "skill" | "agent" | "claude" | "codex";

export function findCapability(
	root: string,
	agents: AgentDef[],
	use: string,
): CapabilitySource | null {
	if (existsSync(join(root, ".agents", "skills", use, "SKILL.md")))
		return "skill";
	if (agents.some((a) => a.name === use)) return "agent";
	if (existsSync(join(root, ".claude", "agents", `${use}.md`))) return "claude";
	if (existsSync(join(root, ".codex", "agents", `${use}.toml`))) return "codex";
	return null;
}

/** Prompt section listing the repo's capabilities. Empty when none are mapped. */
export function capabilitiesSection(caps: Capabilities, extra = ""): string {
	const rows = Object.entries(caps);
	if (!rows.length) return "";
	const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
	return [
		"## Capabilities",
		`The repo maps these needs to its own skills or agents. Use one when its "when" fits the task. Required ones must be used when they apply. For needs not listed, decide yourself.${extra ? ` ${extra}` : ""}`,
		"",
		"| Name | When | Use | Required |",
		"| --- | --- | --- | --- |",
		...rows.map(
			([name, c]) =>
				`| ${name} | ${cell(c.when ?? "When it fits the task")} | \`${c.use}\` | ${c.required ? "yes" : "no"} |`,
		),
	].join("\n");
}

/** Craft skills earlier kanbot versions installed, and the capability each maps to. */
const LEGACY: [name: string, use: string, when?: string][] = [
	["verify", "verify-ui", "Changes to UI users see"],
	["review", "code-review"],
	["tdd", "tdd", "Writing or changing behaviour"],
	["ui-design", "frontend-design", "Building or restyling UI"],
	["accessibility", "accessibility", "Changes to UI users see"],
];

/**
 * A capabilities block for craft skills an earlier kanbot installed, so
 * upgrades keep using them. Null when config already maps capabilities or
 * none of them are present.
 */
export function legacyCapabilities(
	root: string,
	current: Capabilities,
): Capabilities | null {
	if (Object.keys(current).length) return null;
	const found = LEGACY.filter(([, use]) =>
		existsSync(join(root, ".agents", "skills", use, "SKILL.md")),
	);
	if (!found.length) return null;
	return Object.fromEntries(
		found.map(([name, use, when]) => [
			name,
			{ use, ...(when ? { when } : {}), required: false },
		]),
	);
}

export const RESERVED: Record<(typeof RESERVED_CAPABILITIES)[number], string> =
	{
		verify: "prove acceptance criteria",
		review: "technical review",
		preview: "something a human can try",
	};

/** Skills and agents in the repo that kanbot didn't ship. */
export async function ownWorkers(root: string): Promise<string[]> {
	const list = async (dir: string, ext?: string) =>
		existsSync(dir)
			? (await readdir(dir, { withFileTypes: true }))
					.filter((e) => (ext ? e.name.endsWith(ext) : e.isDirectory()))
					.map((e) => (ext ? e.name.slice(0, -ext.length) : e.name))
			: [];
	const shipped = new Set([
		...(await list(join(TEMPLATES, ".agents", "skills"))),
		...(await list(join(TEMPLATES, ".kanbot", "agents"), ".md")),
	]);
	const all = [
		...(await list(join(root, ".agents", "skills"))),
		...(await list(join(root, ".kanbot", "agents"), ".md")),
	];
	return [...new Set(all)].filter((n) => !shipped.has(n)).sort();
}

/**
 * Asks which of the repo's own skills or agents fill each reserved need.
 * `ask` returns the answer, or null/empty to skip.
 */
export function askCapabilities(
	workers: string[],
	ask: (question: string) => string | null,
): Capabilities {
	const caps: Capabilities = {};
	if (!workers.length) return caps;
	const yes = ask(
		`Map your own skills and agents to kanbot capabilities now? Found: ${workers.join(", ")} [y/N]`,
	);
	if (!/^y/i.test(yes?.trim() ?? "")) return caps;
	for (const [name, what] of Object.entries(RESERVED)) {
		const use = ask(`${name} (${what}): skill or agent, Enter to skip`)?.trim();
		if (use && workers.includes(use)) caps[name] = { use, required: false };
	}
	return caps;
}

/** Short suggestions for reserved needs nothing is mapped to. */
export function capabilityGaps(caps: Capabilities): string[] {
	const gaps: string[] = [];
	if (!caps.verify)
		gaps.push(
			"no `verify`: map a skill that proves acceptance criteria, e.g. UI checks or end-to-end tests",
		);
	if (!caps.preview)
		gaps.push(
			"no `preview`: map a skill that gives a human something to try, e.g. a preview deploy or a test build",
		);
	return gaps;
}
