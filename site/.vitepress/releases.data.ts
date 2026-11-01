import { createMarkdownRenderer, defineLoader } from "vitepress";

export type Release = {
	tag: string;
	url: string;
	date: string;
	html: string;
};

declare const data: Release[];

export { data };

const api = "https://api.github.com/repos/mikaelbr/kanbot/releases";

type ApiRelease = {
	tag_name: string;
	html_url: string;
	published_at: string;
	body: string | null;
	draft: boolean;
};

// Published GitHub releases, fetched at build time. GITHUB_TOKEN avoids rate limits in CI.
export default defineLoader({
	async load(): Promise<Release[]> {
		const token = process.env.GITHUB_TOKEN;
		const res = await fetch(`${api}?per_page=100`, {
			headers: token ? { Authorization: `Bearer ${token}` } : {},
		}).catch((err: Error) => err);
		if (res instanceof Error || !res.ok) {
			// Don't break local builds when offline or rate limited.
			const reason = res instanceof Error ? res.message : res.status;
			console.warn(`Could not fetch releases: ${reason}`);
			return [];
		}
		const md = await createMarkdownRenderer(process.cwd());
		const releases = (await res.json()) as ApiRelease[];
		return releases
			.filter((r) => !r.draft)
			.map((r) => ({
				tag: r.tag_name,
				url: r.html_url,
				date: r.published_at.slice(0, 10),
				html: md.render(r.body ?? ""),
			}));
	},
});
