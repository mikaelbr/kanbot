import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { legacyCapabilities } from "../src/capabilities.ts";
import { globalSkillDirs, installGlobal } from "../src/commands/skills.ts";
import knownHashes from "../src/known-hashes.json" with { type: "json" };
import {
	applyUpgrade,
	fileClass,
	hash,
	listTemplates,
	NEW_SUFFIX,
	pendingMerges,
	planUpgrade,
	readManifest,
	unfilledTemplates,
} from "../src/templates.ts";

const dirs: string[] = [];
afterEach(async () => {
	for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function tmp() {
	const d = await mkdtemp(join(tmpdir(), "kanbot-tpl-"));
	dirs.push(d);
	return d;
}

async function writeAll(dir: string, files: Record<string, string>) {
	for (const [p, c] of Object.entries(files)) await Bun.write(join(dir, p), c);
}

const SKILL = ".agents/skills/tdd/SKILL.md";
const CONVENTIONS = ".agents/skills/project-conventions/SKILL.md";
const WORKFLOW = ".github/workflows/kanbot-merged.yml";

/** Install v1 templates, then swap in v2 and plan an upgrade. */
async function setup(
	v1: Record<string, string>,
	v2: Record<string, string>,
	edit?: (root: string) => Promise<unknown>,
) {
	const tpl = await tmp();
	const root = await tmp();
	await writeAll(tpl, v1);
	await applyUpgrade(root, await planUpgrade(root, { templates: tpl }));
	await edit?.(root);
	await rm(tpl, { recursive: true });
	await writeAll(tpl, v2);
	const upgrade = (known = {}) => planUpgrade(root, { templates: tpl, known });
	return { tpl, root, upgrade };
}

const actions = (plan: Awaited<ReturnType<typeof planUpgrade>>) =>
	Object.fromEntries(plan.changes.map((c) => [c.path, c.action]));

describe("file classes", () => {
	test("conventions are yours, kanbot workflows are kanbot's", () => {
		expect(fileClass(CONVENTIONS)).toBe("user");
		expect(fileClass("AGENTS.md")).toBe("user");
		expect(fileClass(WORKFLOW)).toBe("kanbot");
		expect(fileClass(SKILL)).toBe("shared");
	});
});

describe("upgrade", () => {
	test("fresh install adds everything and writes a manifest", async () => {
		const tpl = await tmp();
		const root = await tmp();
		await writeAll(tpl, { [SKILL]: "v1" });
		const plan = await planUpgrade(root, { templates: tpl });
		expect(actions(plan)).toEqual({ [SKILL]: "add" });
		await applyUpgrade(root, plan);
		expect(await Bun.file(join(root, SKILL)).text()).toBe("v1");
		expect((await readManifest(root))?.files[SKILL]).toBe(
			hash(new TextEncoder().encode("v1")),
		);
	});

	test("unedited shared file is updated", async () => {
		const { upgrade } = await setup({ [SKILL]: "v1" }, { [SKILL]: "v2" });
		expect(actions(await upgrade())).toEqual({ [SKILL]: "update" });
	});

	test("edited shared file gets a .kanbot-new copy, once", async () => {
		const { root, tpl, upgrade } = await setup(
			{ [SKILL]: "v1" },
			{ [SKILL]: "v2" },
			(r) => Bun.write(join(r, SKILL), "mine"),
		);
		const plan = await upgrade();
		expect(actions(plan)).toEqual({ [SKILL]: "conflict" });
		await applyUpgrade(root, plan);
		expect(await Bun.file(join(root, SKILL)).text()).toBe("mine");
		expect(await Bun.file(join(root, SKILL + NEW_SUFFIX)).text()).toBe("v2");
		expect(await pendingMerges(root, tpl)).toEqual([SKILL]);

		// After merging, the file is not flagged again until the template changes.
		await Bun.write(join(root, SKILL), "mine + v2");
		await rm(join(root, SKILL + NEW_SUFFIX));
		expect((await upgrade()).changes).toEqual([]);
	});

	test("edited shared file with unchanged template is left alone", async () => {
		const { upgrade } = await setup({ [SKILL]: "v1" }, { [SKILL]: "v1" }, (r) =>
			Bun.write(join(r, SKILL), "mine"),
		);
		expect((await upgrade()).changes).toEqual([]);
	});

	test("user-owned files are never touched", async () => {
		const { upgrade } = await setup(
			{ [CONVENTIONS]: "v1" },
			{ [CONVENTIONS]: "v2" },
		);
		expect((await upgrade()).changes).toEqual([]);
	});

	test("kanbot-owned files are replaced even when edited", async () => {
		const { upgrade } = await setup(
			{ [WORKFLOW]: "v1" },
			{ [WORKFLOW]: "v2" },
			(r) => Bun.write(join(r, WORKFLOW), "mine"),
		);
		expect(actions(await upgrade())).toEqual({ [WORKFLOW]: "update" });
	});

	test("deleted files stay deleted; dropped templates are reported", async () => {
		const { root, upgrade } = await setup(
			{ [SKILL]: "v1", "old.md": "x" },
			{ [SKILL]: "v2" },
			(r) => rm(join(r, SKILL)),
		);
		const plan = await upgrade();
		expect(actions(plan)).toEqual({ [SKILL]: "deleted", "old.md": "removed" });
		await applyUpgrade(root, plan);
		expect(existsSync(join(root, SKILL))).toBe(false);
	});

	test("without a manifest, known past versions count as unedited", async () => {
		const tpl = await tmp();
		const root = await tmp();
		await writeAll(tpl, { [SKILL]: "v2", "b.md": "v2" });
		await writeAll(root, { [SKILL]: "v1", "b.md": "mine" });
		const v1 = hash(new TextEncoder().encode("v1"));
		const plan = await planUpgrade(root, {
			templates: tpl,
			known: { [SKILL]: [v1], "b.md": [v1] },
		});
		expect(actions(plan)).toEqual({ [SKILL]: "update", "b.md": "conflict" });
	});
});

describe("upgrade from the v0.3 layout", () => {
	const CRAFT = [
		".agents/skills/verify-ui/SKILL.md",
		".agents/skills/code-review/SKILL.md",
		".agents/skills/tdd/SKILL.md",
		".kanbot/agents/implementer-frontend.md",
	];

	test("craft files stay in place and map to capabilities", async () => {
		const tpl = await tmp();
		const root = await tmp();
		await writeAll(tpl, Object.fromEntries(CRAFT.map((p) => [p, "old"])));
		await applyUpgrade(root, await planUpgrade(root, { templates: tpl }));

		const plan = await planUpgrade(root);
		for (const p of CRAFT) expect(actions(plan)[p]).toBe("removed");
		await applyUpgrade(root, plan);
		for (const p of CRAFT) expect(existsSync(join(root, p))).toBe(true);
		expect(existsSync(join(root, ".kanbot/agents/implementer.md"))).toBe(true);

		expect(legacyCapabilities(root, {})).toEqual({
			verify: {
				use: "verify-ui",
				when: "Changes to UI users see",
				required: false,
			},
			review: { use: "code-review", required: false },
			tdd: {
				use: "tdd",
				when: "Writing or changing behaviour",
				required: false,
			},
		});
	});

	test("an existing capabilities block is left alone", async () => {
		const root = await tmp();
		await writeAll(root, { [CRAFT[0] as string]: "old" });
		expect(
			legacyCapabilities(root, { verify: { use: "mine", required: false } }),
		).toBeNull();
		expect(legacyCapabilities(await tmp(), {})).toBeNull();
	});
});

test("known-hashes.json covers the current templates (run `bun run hashes`)", async () => {
	const known: Record<string, string[]> = knownHashes;
	for (const [path, content] of await listTemplates()) {
		expect(known[path] ?? []).toContain(hash(content));
	}
});

test("skills install copies global skills into each provider's folder", async () => {
	const home = await tmp();
	const written = await installGlobal(["claude", "codex"], home);
	const dirs = globalSkillDirs(home);
	expect(written).toContain(join(dirs.claude, "kanbot-idea", "SKILL.md"));
	expect(written).toContain(join(dirs.codex, "kanbot-idea", "SKILL.md"));
	expect(written).toContain(join(dirs.claude, "kanbot-guide", "SKILL.md"));
	expect(
		written.every(
			(f) => f.includes("kanbot-idea") || f.includes("kanbot-guide"),
		),
	).toBe(true);
});

describe("unfilledTemplates", () => {
	const tpl = {
		[CONVENTIONS]:
			"# Conventions\n\n- Test: `<run all tests>`\n- Lint: `<lint>`\n",
	};

	async function check(content?: string) {
		const dir = await tmp();
		const root = await tmp();
		await writeAll(dir, tpl);
		if (content !== undefined) await writeAll(root, { [CONVENTIONS]: content });
		return unfilledTemplates(root, { templates: dir, known: {} });
	}

	test("flags an unchanged template", async () => {
		const [u] = await check(tpl[CONVENTIONS]);
		expect(u?.detail).toBe("unchanged from the template");
	});

	test("lists lines with placeholders left", async () => {
		const [u] = await check(
			"# Conventions\n\n- Test: `bun test`\n- Lint: `<lint>`\n",
		);
		expect(u?.detail).toContain("line 4: - Lint: `<lint>`");
		expect(u?.detail).not.toContain("bun test");
	});

	test("passes when filled in, ignoring other <tags>", async () => {
		expect(
			await check("# Conventions\n\n- Test: `bun test`\n- <details>\n"),
		).toEqual([]);
	});

	test("skips missing files", async () => {
		expect(await check()).toEqual([]);
	});
});
