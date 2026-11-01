import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgent } from "../src/agents/load.ts";
import { findCapability } from "../src/capabilities.ts";

test("findCapability finds skills, kanbot agents and single-provider agents", async () => {
	const root = await mkdtemp(join(tmpdir(), "kanbot-caps-"));
	await Bun.write(join(root, ".agents/skills/verify-ui/SKILL.md"), "x");
	await Bun.write(join(root, ".claude/agents/cc.md"), "x");
	await Bun.write(join(root, ".codex/agents/cx.toml"), "x");
	const agents = [
		parseAgent(
			"---\nname: bench\ntier: sub\ndescription: x\n---\nBody",
			"b.md",
		),
	];
	expect(findCapability(root, agents, "verify-ui")).toBe("skill");
	expect(findCapability(root, agents, "bench")).toBe("agent");
	expect(findCapability(root, agents, "cc")).toBe("claude");
	expect(findCapability(root, agents, "cx")).toBe("codex");
	expect(findCapability(root, agents, "nope")).toBeNull();
});
