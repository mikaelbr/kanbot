import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentDef } from "./agents/load.ts";
import type { Config } from "./config.ts";

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
