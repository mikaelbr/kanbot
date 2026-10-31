import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const docsDir = resolve(import.meta.dirname, "../../docs");

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

// Docs in file order. Slug comes from frontmatter, else the name without its number prefix.
export function loadDocs(): Doc[] {
	return readdirSync(docsDir)
		.filter((file) => file.endsWith(".md"))
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
