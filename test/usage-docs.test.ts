import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildSpec, type Spec } from "../src/completion.ts";
import { main } from "../src/main.ts";

const DOCS = join(import.meta.dir, "..", "docs");
const SRC = join(import.meta.dir, "..", "src");

const slugify = (h: string) =>
	h
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-");

/** Page slug → heading anchors, from the docs' frontmatter and headings. */
async function anchors() {
	const pages = new Map<string, Set<string>>();
	for (const f of await readdir(DOCS)) {
		if (!f.endsWith(".md")) continue;
		const text = await Bun.file(join(DOCS, f)).text();
		const slug = text.match(/^slug:\s*(\S+)/m)?.[1];
		if (!slug) continue;
		const heads = [...text.matchAll(/^#{2,6}\s+(.+)$/gm)].map((m) =>
			slugify(m[1] ?? ""),
		);
		pages.set(slug, new Set(heads));
	}
	return pages;
}

/** Leaf commands with their path, e.g. ["board create", spec]. */
function leaves(spec: Spec, path: string[] = []): [string, Spec][] {
	if (!spec.subs.length) return [[path.join(" "), spec]];
	return spec.subs.flatMap((s) => leaves(s, [...path, s.name]));
}

// Keeps docs/11-usage.md and error links in step with the CLI.
describe("usage docs", async () => {
	const usage = await Bun.file(join(DOCS, "11-usage.md")).text();
	const sections = new Map(
		usage
			.split(/^## /m)
			.slice(1)
			.map((s) => [s.slice(0, s.indexOf("\n")).trim(), s] as const),
	);

	for (const [path, spec] of leaves(await buildSpec(main)))
		test(`documents kanbot ${path} and its flags`, () => {
			const section = sections.get(`\`kanbot ${path}\``);
			expect(section, `no "## \`kanbot ${path}\`" in usage docs`).toBeDefined();
			for (const f of spec.flags)
				if (f.name !== "help" && f.name !== "version")
					expect(section).toContain(`--${f.name}`);
		});

	test("docs links in src point to real headings", async () => {
		const pages = await anchors();
		const glob = new Bun.Glob("**/*.ts");
		for await (const f of glob.scan(SRC)) {
			const text = await Bun.file(join(SRC, f)).text();
			for (const [, ref] of text.matchAll(/docs: "([^"]+)"/g)) {
				const [page = "", anchor] = (ref ?? "").split("#");
				expect(pages.has(page), `${f}: page "${page}"`).toBe(true);
				if (anchor)
					expect(pages.get(page)?.has(anchor), `${f}: ${ref}`).toBe(true);
			}
		}
	});
});
