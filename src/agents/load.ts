import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
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
	return join(root, ".autogh", "agents");
}

export function parseAgent(text: string, file: string): AgentDef {
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!m) throw new Error(`${file}: missing YAML frontmatter`);
	const fm = Frontmatter.safeParse(parse(m[1] as string));
	if (!fm.success) {
		throw new Error(`${file}: ${z.prettifyError(fm.error)}`);
	}
	return { ...fm.data, body: (m[2] as string).trim(), file };
}

export async function loadAgents(root: string): Promise<AgentDef[]> {
	const dir = agentsDir(root);
	const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
	const agents = await Promise.all(
		files.map(async (f) =>
			parseAgent(await Bun.file(join(dir, f)).text(), join(dir, f)),
		),
	);
	validate(agents);
	return agents;
}

function validate(agents: AgentDef[]) {
	const names = new Set(agents.map((a) => a.name));
	if (names.size !== agents.length) {
		throw new Error("Duplicate agent names in .autogh/agents");
	}
	for (const a of agents) {
		if (!a.file.endsWith(`${a.name}.md`)) {
			throw new Error(`${a.file}: name "${a.name}" must match the filename`);
		}
		if (a.tier === "column" && !a.output) {
			throw new Error(`${a.file}: column agents must declare an output schema`);
		}
		for (const s of a.subagents) {
			const sub = agents.find((x) => x.name === s);
			if (!sub) throw new Error(`${a.file}: unknown subagent "${s}"`);
			if (sub.tier !== "sub") {
				throw new Error(`${a.file}: "${s}" is not a tier: sub agent`);
			}
		}
	}
}

export function getAgent(agents: AgentDef[], name: string): AgentDef {
	const a = agents.find((x) => x.name === name);
	if (!a) throw new Error(`No agent named "${name}" in .autogh/agents`);
	return a;
}
