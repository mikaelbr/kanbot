import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, Worktrees } from "../src/daemon/git.ts";

let dir = "";
afterEach(() => rm(dir, { recursive: true, force: true }));

/** Repo where `main` and `feature` both changed line 1 of a.txt. */
async function repo(conflict: boolean) {
	dir = await mkdtemp(join(tmpdir(), "kanbot-merge-"));
	const g = (...a: string[]) => git(dir, ...a);
	await g("init", "-q", "-b", "main");
	await g("config", "user.email", "t@t");
	await g("config", "user.name", "t");
	await Bun.write(join(dir, "a.txt"), "one\n");
	await g("add", "-A");
	await g("commit", "-qm", "init");
	await g("checkout", "-qb", "feature");
	await Bun.write(join(dir, "a.txt"), "feature\n");
	await g("commit", "-qam", "feature");
	await g("checkout", "-q", "main");
	await Bun.write(join(dir, conflict ? "a.txt" : "b.txt"), "main\n");
	await g("add", "-A");
	await g("commit", "-qm", "main");
	await g("checkout", "-q", "feature");
	return new Worktrees(dir, "acme/app", "main");
}

describe("merge", () => {
	test("clean merge returns no conflicts", async () => {
		const w = await repo(false);
		expect(await w.merge(dir, "main")).toEqual([]);
		expect(await w.isAncestor(dir, "main")).toBe(true);
	});

	test("conflicting merge returns files and can be concluded", async () => {
		const w = await repo(true);
		expect(await w.merge(dir, "main")).toEqual(["a.txt"]);
		expect(await w.isAncestor(dir, "main")).toBe(false);
		await Bun.write(join(dir, "a.txt"), "feature and main\n");
		await w.concludeMerge(dir);
		expect(await w.isAncestor(dir, "main")).toBe(true);
		expect(await git(dir, "status", "--porcelain")).toBe("");
	});
});
