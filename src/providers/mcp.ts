import { existsSync } from "node:fs";
import { join } from "node:path";

/*
 * Workers get the repo's committed MCP servers, never the user's own.
 * `.mcp.json` (Claude's format) is the one source for both providers.
 */

export type McpServer = {
	type?: string;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
	headers?: Record<string, string>;
};

export function mcpConfigPath(dir: string): string | null {
	const path = join(dir, ".mcp.json");
	return existsSync(path) ? path : null;
}

/** Servers in `<dir>/.mcp.json`. Empty when missing or unreadable. */
export async function readMcpServers(
	dir: string,
): Promise<Record<string, McpServer>> {
	const path = mcpConfigPath(dir);
	if (!path) return {};
	try {
		const json = (await Bun.file(path).json()) as {
			mcpServers?: Record<string, McpServer>;
		};
		return json.mcpServers ?? {};
	} catch {
		return {};
	}
}

/** Codex runs stdio and streamable HTTP servers. Others (e.g. sse) are left out. */
export function codexSupports(s: McpServer): boolean {
	if (s.type === "sse") return false;
	return Boolean(s.command || s.url);
}

const str = (s: string) => JSON.stringify(s);
const table = (o: Record<string, string>) =>
	`{${Object.entries(o)
		.map(([k, v]) => `${str(k)}=${str(v)}`)
		.join(",")}}`;

/** `-c mcp_servers=…` for codex, as an inline TOML table. Empty when none. */
export function codexMcpArgs(servers: Record<string, McpServer>): string[] {
	const entries = Object.entries(servers)
		.filter(([, s]) => codexSupports(s))
		.map(([name, s]) => {
			const fields = s.command
				? [
						`command=${str(s.command)}`,
						s.args?.length ? `args=[${s.args.map(str).join(",")}]` : "",
						s.env && Object.keys(s.env).length ? `env=${table(s.env)}` : "",
					]
				: [
						`url=${str(s.url as string)}`,
						s.headers && Object.keys(s.headers).length
							? `http_headers=${table(s.headers)}`
							: "",
					];
			return `${str(name)}={${fields.filter(Boolean).join(",")}}`;
		});
	return entries.length ? ["-c", `mcp_servers={${entries.join(",")}}`] : [];
}
