import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgent } from "../src/agents/load.ts";
import { claudeArgs } from "../src/providers/claude.ts";
import { codexArgs } from "../src/providers/codex.ts";
import { codexMcpArgs, readMcpServers } from "../src/providers/mcp.ts";

const agent = parseAgent(
	"---\nname: a\ntier: column\ndescription: x\ntools: [read, edit]\n---\nBody",
	"a.md",
);

async function repo(mcp?: object) {
	const cwd = await mkdtemp(join(tmpdir(), "kanbot-prov-"));
	if (mcp) await Bun.write(join(cwd, ".mcp.json"), JSON.stringify(mcp));
	return cwd;
}

function claude(cwd: string) {
	return claudeArgs(
		{
			agent,
			agents: [agent],
			prompt: "",
			cwd,
			schema: {},
			timeoutMs: 1,
			logFile: "",
			repoRoot: cwd,
		},
		"agents.json",
	);
}

test("claude passes the repo's .mcp.json next to --strict-mcp-config", async () => {
	const cwd = await repo({ mcpServers: { db: { command: "db-mcp" } } });
	const args = claude(cwd);
	expect(args).toContain("--strict-mcp-config");
	expect(args[args.indexOf("--mcp-config") + 1]).toBe(join(cwd, ".mcp.json"));
});

test("claude gets no MCP config without .mcp.json", async () => {
	const args = claude(await repo());
	expect(args).toContain("--strict-mcp-config");
	expect(args).not.toContain("--mcp-config");
});

test("codex ignores user config and gets the repo's servers", async () => {
	const cwd = await repo({
		mcpServers: {
			db: { command: "db-mcp", args: ["--ro"], env: { A: "1" } },
			docs: { type: "http", url: "https://x.dev/mcp" },
			old: { type: "sse", url: "https://x.dev/sse" },
		},
	});
	const args = codexArgs({
		agent,
		cwd,
		gitDir: "/g",
		schemaFile: "s",
		lastFile: "l",
		networkAccess: false,
		mcpServers: await readMcpServers(cwd),
	});
	expect(args).toContain("--ignore-user-config");
	expect(args).toContain(
		'mcp_servers={"db"={command="db-mcp",args=["--ro"],env={"A"="1"}},"docs"={url="https://x.dev/mcp"}}',
	);
	expect(args.at(-1)).toBe("-");
});

test("codex gets no mcp_servers override without servers", () => {
	expect(codexMcpArgs({})).toEqual([]);
});
