import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	configPath,
	configSchemaPath,
	loadConfig,
	renderConfigSchema,
	sameJson,
	saveConfig,
	writeConfigSchema,
} from "../src/config.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "kanbot-config-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

test("published schema is up to date (run `bun run schema`)", async () => {
	const published = await Bun.file(
		join(import.meta.dir, "..", "schema", "config.schema.json"),
	).text();
	expect(sameJson(published, renderConfigSchema())).toBe(true);
});

test("schema only requires repo", () => {
	const schema = JSON.parse(renderConfigSchema());
	expect(schema.required).toEqual(["repo"]);
	expect(schema.properties.concurrency.description).toBeTruthy();
});

test("new config gets schema header and schema file", async () => {
	await saveConfig(root, { repo: "acme/app" });
	const text = await Bun.file(configPath(root)).text();
	expect(text).toStartWith(
		"# yaml-language-server: $schema=./config.schema.json",
	);
	expect(await Bun.file(configSchemaPath(root)).text()).toBe(
		renderConfigSchema(),
	);
	expect((await loadConfig(root)).repo).toBe("acme/app");
});

test("saveConfig keeps user comments", async () => {
	await saveConfig(root, { repo: "acme/app" });
	const path = configPath(root);
	await Bun.write(
		path,
		`${await Bun.file(path).text()}concurrency: 5 # my box is small\n`,
	);
	await saveConfig(root, { project: { owner: "acme", number: 7 } });
	const text = await Bun.file(path).text();
	expect(text).toContain("concurrency: 5 # my box is small");
	expect((await loadConfig(root)).project).toEqual({
		owner: "acme",
		number: 7,
	});
});

test("writeConfigSchema check reports stale without writing", async () => {
	expect(await writeConfigSchema(root, { check: true })).toBe(true);
	expect(await Bun.file(configSchemaPath(root)).exists()).toBe(false);
	expect(await writeConfigSchema(root)).toBe(true);
	expect(await writeConfigSchema(root, { check: true })).toBe(false);
});
