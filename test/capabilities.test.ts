import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgent } from "../src/agents/load.ts";
import {
	askCapabilities,
	capabilitySummary,
	compact,
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

test("summary lists what is mapped and what could be added", () => {
	expect(capabilitySummary({})).toBe(
		"none mapped; could add verify, review, preview (kanbot-guide can help)",
	);
	expect(
		capabilitySummary({
			verify: { use: "e2e", required: false },
			review: { use: "cr", required: false },
			preview: { use: "deploy", required: false },
		}),
	).toBe("verify → e2e, review → cr, preview → deploy");
});

test("compact writes bare names unless when or required is set", () => {
	expect(
		compact({
			review: { use: "code-review", required: false },
			verify: { use: "e2e", when: "UI", required: false },
			preview: { use: "deploy", required: true },
		}),
	).toEqual({
		review: "code-review",
		verify: { use: "e2e", when: "UI" },
		preview: { use: "deploy", required: true },
	});
});
