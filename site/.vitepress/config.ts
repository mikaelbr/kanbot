import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig } from "vitepress";
import { type Doc, docsDir, linkRewriter, loadDocs } from "./docs";

const repo = "https://github.com/mikaelbr/kanbot";
// Pages workflow sets these for kanbot.mib.im. Defaults match a local build.
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

// Raw markdown per page plus llms.txt, for agents. Path -> content.
function agentFiles(docs: Doc[], url = siteUrl): Record<string, string> {
	const rewriteLink = linkRewriter(docs);
	const files: Record<string, string> = {};
	const bodies: string[] = [];
	for (const d of docs) {
		const body = d.body.replace(
			/\]\((\.\/[^)]+)\)/g,
			(_, href) => `](${rewriteLink(href)})`,
		);
		bodies.push(body);
		files[`${d.slug}.md`] = `${body}\n`;
	}
	files["llms.txt"] = llmsTxt(docs, url);
	files["llms-full.txt"] = bodies.join("\n\n---\n\n");
	return files;
}

function llmsTxt(docs: Doc[], url: string): string {
	const index = docs.find((d) => d.slug === "index");
	const pages = docs
		.filter((d) => d.slug !== "index")
		.map((d) => `- [${d.title}](${url}/${d.slug}.md): ${d.description}`);
	return [
		"# kanbot",
		"",
		`> ${index?.description ?? ""}`,
		"",
		"## Docs",
		"",
		`- [Full docs](${url}/llms-full.txt): all pages in one file.`,
		...pages,
		"",
	].join("\n");
}

export default defineConfig({
	title: "kanbot",
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
		plugins: [
			{
				// buildEnd only runs on build. Serve the same files in dev.
				name: "agent-files",
				enforce: "pre",
				configureServer(server) {
					server.middlewares.use((req, res, next) => {
						// Skip module imports of .md pages (/foo.md?t=...).
						if (!req.url || req.url.includes("?")) return next();
						if (req.headers["sec-fetch-dest"] === "script") return next();
						const path = req.url.slice(base.length);
						const url = `http://${req.headers.host}${base}`.replace(/\/$/, "");
						const content = path && agentFiles(loadDocs(), url)[path];
						if (!content) return next();
						const type = path.endsWith(".md") ? "markdown" : "plain";
						res.setHeader("Content-Type", `text/${type}; charset=utf-8`);
						res.end(content);
					});
				},
			},
		],
	},
	themeConfig: {
		// Not a page, so VitePress won't add base itself.
		nav: [{ text: "llms.txt", link: `${base}llms.txt`, target: "_blank" }],
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
	buildEnd({ outDir }) {
		for (const [path, content] of Object.entries(agentFiles(docs))) {
			writeFileSync(join(outDir, path), content);
		}
	},
});
