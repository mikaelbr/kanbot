import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgent } from "../src/agents/load.ts";
import {
	askCapabilities,
	capabilityGaps,
	findCapability,
	ownWorkers,
} from "../src/capabilities.ts";

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

const answers =
	(...a: (string | null)[]) =>
	() =>
		a.shift() ?? null;

test("init maps the answers to capabilities", () => {
	const caps = askCapabilities(
		["e2e", "deploy-preview"],
		answers("y", "e2e", "", "deploy-preview"),
	);
	expect(caps).toEqual({
		verify: { use: "e2e", required: false },
		preview: { use: "deploy-preview", required: false },
	});
});

test("init skips the map when declined, unknown or nothing to map", () => {
	expect(askCapabilities(["e2e"], answers("n"))).toEqual({});
	expect(askCapabilities(["e2e"], answers("y", "nope", null, null))).toEqual(
		{},
	);
	let asked = false;
	expect(
		askCapabilities([], () => {
			asked = true;
			return "y";
		}),
	).toEqual({});
	expect(asked).toBe(false);
});

test("ownWorkers lists only what kanbot didn't ship", async () => {
	const root = await mkdtemp(join(tmpdir(), "kanbot-own-"));
	await Bun.write(join(root, ".agents/skills/e2e/SKILL.md"), "x");
	await Bun.write(join(root, ".agents/skills/plan-template/SKILL.md"), "x");
	await Bun.write(join(root, ".kanbot/agents/bench.md"), "x");
	await Bun.write(join(root, ".kanbot/agents/planner.md"), "x");
	expect(await ownWorkers(root)).toEqual(["bench", "e2e"]);
});

test("gaps suggest verify and preview until mapped", () => {
	expect(capabilityGaps({}).length).toBe(2);
	expect(
		capabilityGaps({
			verify: { use: "a", required: false },
			preview: { use: "b", required: false },
		}),
	).toEqual([]);
});
