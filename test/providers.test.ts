import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgent } from "../src/agents/load.ts";
import { claudeArgs } from "../src/providers/claude.ts";
import { codexArgs } from "../src/providers/codex.ts";
import { codexMcpArgs, readMcpServers } from "../src/providers/mcp.ts";
import { spawnWorker, workerEnv } from "../src/providers/types.ts";

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
		schemaFile: "s",
		lastFile: "l",
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

test("codex runs editing agents without a sandbox, readers read-only", async () => {
	const cwd = await repo();
	const args = (a: typeof agent) =>
		codexArgs({
			agent: a,
			cwd,
			schemaFile: "s",
			lastFile: "l",
			mcpServers: {},
		});
	expect(args(agent)).toContain("--dangerously-bypass-approvals-and-sandbox");
	const reader = { ...agent, tools: ["read" as const] };
	expect(args(reader).join(" ")).toContain("--sandbox read-only");
});

test("workers can't push or use gh's login", async () => {
	const dir = await repo();
	const sh = (cmd: string, env?: Record<string, string>) =>
		Bun.spawnSync(["sh", "-c", cmd], { cwd: dir, env }).exitCode;
	sh(
		"git init -q --bare bare.git && git init -q w && cd w && git -c user.name=a -c user.email=a@b -c commit.gpgsign=false commit -q --allow-empty -m i",
	);
	const env = workerEnv({
		PATH: process.env.PATH,
		HOME: process.env.HOME,
		GH_TOKEN: "x",
		GIT_CONFIG_COUNT: "1",
		GIT_CONFIG_KEY_0: "user.name",
		GIT_CONFIG_VALUE_0: "a",
	});
	expect(env.GH_TOKEN).toBeUndefined();
	expect(env.GH_CONFIG_DIR).toBeDefined();
	expect(env.GIT_CONFIG_KEY_0).toBe("user.name");
	expect(sh("cd w && git push -q ../bare.git HEAD:refs/heads/x")).toBe(0);
	expect(sh("cd w && git push -q ../bare.git HEAD:refs/heads/y", env)).not.toBe(
		0,
	);
	expect(sh("cd w && git fetch -q ../bare.git x", env)).toBe(0);
});

test("spawnWorker logs stderr lines as events as they come", async () => {
	const dir = await repo();
	const logFile = join(dir, "log.jsonl");
	const res = await spawnWorker(
		[
			"sh",
			"-c",
			'echo \'{"type":"a"}\'; echo "ERROR no" >&2; echo \'{"type":"b"}\'',
		],
		{ cwd: dir, stdin: "", timeoutMs: 5000, logFile },
	);
	expect(res.stderr).toBe("ERROR no\n");
	const lines = (await Bun.file(logFile).text()).trim().split("\n");
	expect(lines).toContain('{"type":"kanbot.stderr","text":"ERROR no"}');
	expect(lines.filter((l) => l.startsWith('{"type":"'))).toHaveLength(3);
});
