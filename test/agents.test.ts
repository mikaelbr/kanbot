import { describe, expect, test } from "bun:test";
import { mkdtemp, readlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgents, missingSkills, parseAgent } from "../src/agents/load.ts";
import {
	CLAUDE_DENY,
	claudeTools,
	renderAll,
	renderClaudeAgent,
	renderCodexAgent,
	sync,
} from "../src/agents/sync.ts";
import {
	embedJson,
	extractPlan,
	isKanbot,
	readJson,
	stripPlan,
	withDescription,
	withPlan,
} from "../src/github/markers.ts";
import { absoluteImages, excerpt, passAgent } from "../src/jobs/run.ts";
import { jsonSchema, RESULT_SCHEMAS } from "../src/schemas/results.ts";

const TEMPLATES = join(import.meta.dir, "..", "templates");

describe("template agents", () => {
	test("all template agents load and validate", async () => {
		const agents = await loadAgents(TEMPLATES);
		const names = agents.map((a) => a.name);
		for (const n of [
			"planner",
			"implementer-frontend",
			"implementer-backend",
			"implementer-docs",
			"implementer-technical",
			"implementer",
			"reviewer",
			"acceptance-reviewer",
			"fixer",
		]) {
			expect(names).toContain(n);
		}
	});

	test("flow agents name no craft skills or helpers", async () => {
		const agents = await loadAgents(TEMPLATES);
		const craft = [
			"tdd",
			"verify-ui",
			"accessibility",
			"frontend-design",
			"code-review",
		];
		for (const n of [
			"implementer",
			"reviewer",
			"acceptance-reviewer",
			"fixer",
		]) {
			const a = agents.find((x) => x.name === n);
			expect(a?.skills.filter((s) => craft.includes(s))).toEqual([]);
			expect(a?.subagents).toEqual(["explorer"]);
		}
	});

	test("review passes use the new agents, or the old ones before upgrade", async () => {
		const agents = await loadAgents(TEMPLATES);
		expect(passAgent(agents, 1)).toBe("reviewer");
		expect(passAgent(agents, 2)).toBe("acceptance-reviewer");
		const old = agents.filter(
			(a) => a.name !== "reviewer" && a.name !== "acceptance-reviewer",
		);
		expect(passAgent(old, 1)).toBe("reviewer-code");
		expect(passAgent(old, 2)).toBe("reviewer-spec");
	});

	test("every skill an agent lists exists in templates", async () => {
		expect(missingSkills(TEMPLATES, await loadAgents(TEMPLATES))).toEqual([]);
	});

	test("missingSkills names the agent and the missing skill", () => {
		const agent = parseAgent(
			"---\nname: a\ntier: sub\ndescription: x\nskills: [tdd, nope]\n---\nBody",
			"a.md",
		);
		expect(missingSkills(TEMPLATES, [agent])).toEqual(["a: nope"]);
	});
});

describe("sync rendering", () => {
	const agent = parseAgent(
		`---
name: implementer-frontend
tier: column
description: Builds UI
models: { claude: sonnet, codex: gpt-x }
effort: max
tools: [read, edit, bash]
skills: [tdd]
subagents: []
output: implement-result
---
Do the thing.`,
		"implementer-frontend.md",
	);

	test("claude agent has tools, model and skills", () => {
		const out = renderClaudeAgent(agent);
		expect(out).toContain(
			"tools: Read, Grep, Glob, Edit, Write, NotebookEdit, Bash, Skill",
		);
		expect(out).toContain("model: sonnet");
		expect(out).toContain("Do the thing.");
	});

	test("claude agents delegate to subagents with the Agent tool", () => {
		expect(claudeTools({ ...agent, subagents: ["explorer"] })).toContain(
			"Agent",
		);
	});

	test("codex agent is valid-looking TOML with mapped effort", () => {
		const out = renderCodexAgent(agent);
		expect(out).toContain('name = "implementer-frontend"');
		expect(out).toContain('model = "gpt-x"');
		expect(out).toContain('model_reasoning_effort = "xhigh"');
		expect(out).toMatch(/developer_instructions = ".*Do the thing\./s);
	});

	test("settings deny GitHub access", () => {
		const settings = renderAll([agent]).find((f) =>
			f.path.endsWith("settings.json"),
		);
		expect(JSON.parse(settings?.content ?? "{}").permissions.deny).toEqual(
			CLAUDE_DENY,
		);
	});

	test("sync writes files, links skills and is idempotent", async () => {
		const root = await mkdtemp(join(tmpdir(), "kanbot-sync-"));
		await Bun.write(
			join(root, ".kanbot/agents/implementer-frontend.md"),
			await Bun.file(
				join(TEMPLATES, ".kanbot/agents/implementer-frontend.md"),
			).text(),
		);
		const agents = await loadAgents(root).catch(() => null);
		// The template references subagents not present here, so validate against all templates instead.
		expect(agents).toBeNull();
		const all = await loadAgents(TEMPLATES);
		const first = await sync(root, all);
		expect(first.length).toBeGreaterThan(0);
		expect(await readlink(join(root, ".claude/skills"))).toBe(
			join("..", ".agents", "skills"),
		);
		expect(await sync(root, all, { check: true })).toEqual([]);
	});

	test("sync writes Copilot instructions only while review.copilot is on", async () => {
		const root = await mkdtemp(join(tmpdir(), "kanbot-sync-"));
		const all = await loadAgents(TEMPLATES);
		const file = join(root, ".github/copilot-instructions.md");
		await Bun.write(
			join(root, ".kanbot/config.yml"),
			"repo: acme/app\nreview:\n  copilot: true\n",
		);
		expect(await sync(root, all)).toContain(".github/copilot-instructions.md");
		expect(await Bun.file(file).text()).toContain("review-findings/SKILL.md");
		expect(await Bun.file(file).text()).not.toContain("`review` capability");
		await Bun.write(
			join(root, ".kanbot/config.yml"),
			"repo: acme/app\nreview:\n  copilot: true\ncapabilities:\n  review:\n    use: my-review\n",
		);
		await sync(root, all);
		expect(await Bun.file(file).text()).toContain("`my-review`");
		await Bun.write(join(root, ".kanbot/config.yml"), "repo: acme/app\n");
		expect(await sync(root, all)).toContain(".github/copilot-instructions.md");
		expect(await Bun.file(file).exists()).toBe(false);
	});
});

describe("markers", () => {
	test("plan block round-trips and preserves the human text", () => {
		const body = withPlan("Original need", "## Plan v1");
		expect(extractPlan(body)).toBe("## Plan v1");
		const updated = withPlan(`${body}\n\nhuman edit`, "## Plan v2");
		expect(extractPlan(updated)).toBe("## Plan v2");
		expect(stripPlan(updated)).toContain("human edit");
		expect(updated.match(/kanbot:plan:start/g)).toHaveLength(1);
	});

	test("PR description block is replaced, the daemon's tail is kept", () => {
		const body = `${withDescription("", "v1 text")}\n\nCloses #1\n<!-- kanbot:pr:1 -->`;
		const updated = withDescription(body, "v2 text");
		expect(updated).toContain("v2 text");
		expect(updated).not.toContain("v1 text");
		expect(updated).toContain("Closes #1");
		expect(updated.match(/kanbot:desc:start/g)).toHaveLength(1);
	});

	test("PR bodies without a description block get one prepended", () => {
		const updated = withDescription("Old body\n\nCloses #1", "new");
		expect(updated.startsWith("<!-- kanbot:desc:start -->")).toBe(true);
		expect(updated).toContain("Closes #1");
		expect(updated).not.toContain("Old body");
	});

	test("embedded json survives markdown", () => {
		const data = [{ id: "F1", body: "uses `-->` and émoji 🎉" }];
		expect(
			readJson(`text ${embedJson("findings", data)} more`, "findings"),
		).toEqual(data);
		expect(isKanbot(embedJson("x", 1))).toBe(false);
	});
});

test("result schemas export strict JSON schemas", () => {
	for (const name of Object.keys(
		RESULT_SCHEMAS,
	) as (keyof typeof RESULT_SCHEMAS)[]) {
		const s = jsonSchema(name) as {
			additionalProperties: boolean;
			required: string[];
			properties: object;
		};
		expect(s.additionalProperties).toBe(false);
		expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());
	}
});

test("implement-result has no screenshots field", () => {
	const s = jsonSchema("implement-result") as { properties: object };
	expect(Object.keys(s.properties)).not.toContain("screenshots");
});

test("relative screenshots become branch URLs", () => {
	expect(
		absoluteImages(
			"![home](.kanbot/screenshots/a.png) ![x](https://e.com/b.png)",
			"acme/app",
			"kanbot/1",
		),
	).toBe(
		"![home](https://github.com/acme/app/blob/kanbot/1/.kanbot/screenshots/a.png?raw=true) ![x](https://e.com/b.png)",
	);
});

test("comment excerpts cut at a word and mark the cut", () => {
	expect(excerpt("Short one\nsecond line")).toBe("Short one");
	const long = `${"word ".repeat(40)}end`;
	const out = excerpt(long);
	expect(out.endsWith("…")).toBe(true);
	expect(out.length).toBeLessThanOrEqual(121);
	expect(out).not.toMatch(/wor…$/);
});
