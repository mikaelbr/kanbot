import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig } from "vitepress";
import { type Doc, docsDir, linkRewriter, loadDocs } from "./docs";

const repo = "https://github.com/mikaelbr/autogh";
// Set by the Pages workflow. Defaults match a local build.
const base = process.env.DOCS_BASE ?? "/";
const siteUrl = (process.env.DOCS_URL ?? "http://localhost:4173").replace(
	/\/$/,
	"",
);

const vueDir = dirname(
	createRequire(import.meta.url).resolve("vue/package.json"),
);

const docs = loadDocs();
const rewriteLink = linkRewriter(docs);
const index = docs.find((d) => d.slug === "index");

function llmsTxt(docs: Doc[]): string {
	const pages = docs
		.filter((d) => d.slug !== "index")
		.map((d) => `- [${d.title}](${siteUrl}/${d.slug}.md): ${d.description}`);
	return [
		"# autogh",
		"",
		`> ${index?.description ?? ""}`,
		"",
		"## Docs",
		"",
		`- [Full docs](${siteUrl}/llms-full.txt): all pages in one file.`,
		...pages,
		"",
	].join("\n");
}

export default defineConfig({
	title: "autogh",
	description: index?.description,
	srcDir: docsDir,
	base,
	cleanUrls: true,
	lastUpdated: true,
	// 01-getting-started.md -> getting-started.md
	rewrites: Object.fromEntries(docs.map((d) => [d.file, `${d.slug}.md`])),
	markdown: {
		theme: { light: "catppuccin-latte", dark: "catppuccin-macchiato" },
		config(md) {
			md.core.ruler.push("rewrite-doc-links", (state) => {
				for (const token of state.tokens) {
					for (const child of token.children ?? []) {
						const href = child.type === "link_open" && child.attrGet("href");
						if (href) child.attrSet("href", rewriteLink(href));
					}
				}
			});
		},
	},
	// docs/ sits outside site/, so point it at site's vue.
	vite: {
		resolve: { alias: [{ find: /^vue(\/.*)?$/, replacement: `${vueDir}$1` }] },
	},
	themeConfig: {
		nav: [{ text: "llms.txt", link: `${siteUrl}/llms.txt`, target: "_blank" }],
		sidebar: [
			{
				text: "Docs",
				items: docs.map((d) => ({
					text: d.slug === "index" ? "Overview" : d.title,
					link: d.slug === "index" ? "/" : `/${d.slug}`,
				})),
			},
		],
		socialLinks: [{ icon: "github", link: repo }],
		editLink: {
			pattern: `${repo}/edit/main/docs/:path`,
			text: "Edit this page on GitHub",
		},
		search: { provider: "local" },
	},
	// Raw markdown per page plus llms.txt, for agents.
	buildEnd({ outDir }) {
		const bodies: string[] = [];
		for (const d of docs) {
			const body = d.body.replace(
				/\]\((\.\/[^)]+)\)/g,
				(_, href) => `](${rewriteLink(href)})`,
			);
			bodies.push(body);
			writeFileSync(join(outDir, `${d.slug}.md`), `${body}\n`);
		}
		writeFileSync(join(outDir, "llms.txt"), llmsTxt(docs));
		writeFileSync(join(outDir, "llms-full.txt"), bodies.join("\n\n---\n\n"));
	},
});
