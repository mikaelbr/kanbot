import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// DOCS_DIR points at another checkout, e.g. the latest release tag.
export const docsDir = process.env.DOCS_DIR
	? resolve(process.env.DOCS_DIR)
	: resolve(import.meta.dirname, "../../docs");

export type Doc = {
	file: string;
	slug: string;
	title: string;
	description: string;
	body: string;
};

const frontmatter = /^---\n([\s\S]*?)\n---\n/;

function field(yaml: string, key: string): string {
	return yaml.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
}

// ./01-getting-started.md#x -> ./getting-started.md#x
export function linkRewriter(docs: Doc[]): (href: string) => string {
	const slugs = new Map(docs.map((d) => [d.file, d.slug]));
	return (href) =>
		href.replace(/^\.\/([^/#]+\.md)/, (match, file) => {
			const slug = slugs.get(file);
			return slug ? `./${slug}.md` : match;
		});
}

// Sidebar groups from the index page's `## ` headings and the doc links under each.
export function docSections(docs: Doc[]): { text: string; docs: Doc[] }[] {
	const index = docs.find((d) => d.slug === "index");
	const byFile = new Map(docs.map((d) => [d.file, d]));
	const sections: { text: string; docs: Doc[] }[] = [];
	for (const line of index?.body.split("\n") ?? []) {
		const heading = line.match(/^## (.+)$/);
		if (heading) sections.push({ text: heading[1], docs: [] });
		const section = sections.at(-1);
		for (const [, file] of line.matchAll(/\]\(\.\/([^)#]+\.md)/g)) {
			const doc = byFile.get(file);
			if (section && doc) section.docs.push(doc);
		}
	}
	// Pages the index doesn't link still get a menu entry.
	const listed = new Set(sections.flatMap((s) => s.docs));
	const rest = docs.filter((d) => d !== index && !listed.has(d));
	if (rest.length > 0) sections.push({ text: "More", docs: rest });
	return sections.filter((s) => s.docs.length > 0);
}

// Site-only pages, not part of the docs.
const sitePages = new Set(["changelog.md"]);

// Docs in file order. Slug comes from frontmatter, else the name without its number prefix.
export function loadDocs(): Doc[] {
	return readdirSync(docsDir)
		.filter((file) => file.endsWith(".md") && !sitePages.has(file))
		.sort()
		.map((file) => {
			const raw = readFileSync(join(docsDir, file), "utf8");
			const yaml = raw.match(frontmatter)?.[1] ?? "";
			return {
				file,
				slug:
					field(yaml, "slug") || file.replace(/^\d+-/, "").replace(/\.md$/, ""),
				title: field(yaml, "title") || file,
				description: field(yaml, "description"),
				body: raw.replace(frontmatter, "").trim(),
			};
		});
}

export type Skill = {
	name: string;
	meta: [string, string][];
	body: string;
};

// Built-in skills ship in templates/, next to the docs checkout.
export const skillsDir = resolve(docsDir, "../templates/.agents/skills");

// Skill pages come from docs/skills/[skill].md. Older releases don't have it.
export const hasSkillPages = existsSync(join(docsDir, "skills/[skill].md"));

// Strips YAML quotes from a scalar.
function unquote(value: string): string {
	if (/^".*"$/.test(value)) return JSON.parse(value);
	if (/^'.*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'");
	return value;
}

export function loadSkills(): Skill[] {
	if (!existsSync(skillsDir)) return [];
	return readdirSync(skillsDir)
		.filter((name) => existsSync(join(skillsDir, name, "SKILL.md")))
		.sort()
		.map((name) => {
			const raw = readFileSync(join(skillsDir, name, "SKILL.md"), "utf8");
			const yaml = raw.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
			const meta = [...yaml.matchAll(/^(\w[\w-]*):\s*(.*)$/gm)].map(
				([, key = "", value = ""]) =>
					[key, unquote(value.trim())] as [string, string],
			);
			return { name, meta, body: raw.replace(frontmatter, "").trim() };
		});
}

// Demote headings one level, outside code fences, so the page keeps one h1.
function demote(body: string): string {
	let fence = false;
	return body
		.split("\n")
		.map((line) => {
			if (/^(```|~~~)/.test(line)) fence = !fence;
			return !fence && /^#{1,5} /.test(line) ? `#${line}` : line;
		})
		.join("\n");
}

const cell = (s: string) => s.replace(/\|/g, "\\|");

// Markdown for a skill's preview page.
export function skillPage(skill: Skill, repo: string): string {
	const description =
		skill.meta.find(([key]) => key === "description")?.[1] ?? "";
	const path = `.agents/skills/${skill.name}/SKILL.md`;
	return [
		"---",
		`title: ${JSON.stringify(skill.name)}`,
		`description: ${JSON.stringify(description)}`,
		"---",
		"",
		`# \`${skill.name}\``,
		"",
		`Built-in skill. \`kanbot init\` installs it in \`${path}\`. See [Skills](/skills). [Source](${repo}/blob/main/templates/${path}).`,
		"",
		"## Frontmatter",
		"",
		"| Field | Value |",
		"| ----- | ----- |",
		...skill.meta.map(([key, value]) => `| \`${key}\` | ${cell(value)} |`),
		"",
		"---",
		"",
		demote(skill.body),
		"",
	].join("\n");
}
