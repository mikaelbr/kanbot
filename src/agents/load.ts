import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { UserError } from "../errors.ts";
import { RESULT_SCHEMAS } from "../schemas/results.ts";

export const TOOL_CAPABILITIES = ["read", "edit", "bash", "web"] as const;

const Frontmatter = z.object({
	name: z.string().regex(/^[a-z][a-z0-9-]*$/),
	tier: z.enum(["column", "sub"]),
	description: z.string(),
	models: z
		.object({ claude: z.string().optional(), codex: z.string().optional() })
		.default({}),
	effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
	tools: z.array(z.enum(TOOL_CAPABILITIES)).default(["read"]),
	skills: z.array(z.string()).default([]),
	subagents: z.array(z.string()).default([]),
	output: z
		.enum(Object.keys(RESULT_SCHEMAS) as [keyof typeof RESULT_SCHEMAS])
		.optional(),
});

export type AgentDef = z.infer<typeof Frontmatter> & {
	/** Markdown instructions after the frontmatter. */
	body: string;
	file: string;
};

export function agentsDir(root: string) {
	return join(root, ".kanbot", "agents");
}

export function parseAgent(text: string, file: string): AgentDef {
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!m) throw invalid(file, "Missing YAML frontmatter between `---` lines.");
	const fm = Frontmatter.safeParse(parse(m[1] as string));
	if (!fm.success) {
		throw invalid(file, z.prettifyError(fm.error));
	}
	return { ...fm.data, body: (m[2] as string).trim(), file };
}

export async function loadAgents(root: string): Promise<AgentDef[]> {
	const dir = agentsDir(root);
	if (!existsSync(dir)) {
		throw new UserError("kanbot agents are missing.", {
			why: "No .kanbot/agents directory in this repo.",
			fix: "kanbot init (or kanbot upgrade to restore missing files)",
			docs: "getting-started#set-up-a-repository",
		});
	}
	const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
	const agents = await Promise.all(
		files.map(async (f) =>
			parseAgent(await Bun.file(join(dir, f)).text(), join(dir, f)),
		),
	);
	validate(agents);
	return agents;
}

/** `agent: skill` for each skill an agent lists that has no .agents/skills/<skill>/SKILL.md. */
export function missingSkills(root: string, agents: AgentDef[]): string[] {
	return agents.flatMap((a) =>
		a.skills
			.filter(
				(s) => !existsSync(join(root, ".agents", "skills", s, "SKILL.md")),
			)
			.map((s) => `${a.name}: ${s}`),
	);
}

function validate(agents: AgentDef[]) {
	const names = new Set(agents.map((a) => a.name));
	if (names.size !== agents.length) {
		throw new UserError("Duplicate agent names in .kanbot/agents.", {
			why: "Two agent files declare the same `name`.",
			fix: "Give each agent a unique name matching its filename.",
			docs: "agents#frontmatter",
		});
	}
	for (const a of agents) {
		if (!a.file.endsWith(`${a.name}.md`)) {
			throw invalid(a.file, `name "${a.name}" must match the filename.`);
		}
		if (a.tier === "column" && !a.output) {
			throw invalid(a.file, "Column agents must declare an `output` schema.");
		}
		for (const s of a.subagents) {
			const sub = agents.find((x) => x.name === s);
			if (!sub)
				throw invalid(a.file, `Unknown subagent "${s}" in \`subagents\`.`);
			if (sub.tier !== "sub") {
				throw invalid(a.file, `Subagent "${s}" must have \`tier: sub\`.`);
			}
		}
	}
}

function invalid(file: string, why: string) {
	return new UserError(`Invalid agent file ${file}`, {
		why,
		fix: "Fix the file, then run `kanbot sync`.",
		docs: "agents#frontmatter",
	});
}

export function getAgent(agents: AgentDef[], name: string): AgentDef {
	const a = agents.find((x) => x.name === name);
	if (!a) throw new Error(`No agent named "${name}" in .kanbot/agents`);
	return a;
}
