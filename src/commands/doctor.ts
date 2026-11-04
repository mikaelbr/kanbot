import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { loadAgents, missingSkills } from "../agents/load.ts";
import { sync } from "../agents/sync.ts";
import { capabilitySummary, findCapability } from "../capabilities.ts";
import { color } from "../color.ts";
import { loadConfig, writeConfigSchema } from "../config.ts";
import { git } from "../daemon/git.ts";
import { providerFor } from "../daemon/loop.ts";
import { DOCS_URL, describeError } from "../errors.ts";
import { copilotReviewRule } from "../github/api.ts";
import { appKeyPath, appTokens } from "../github/app.ts";
import { Gh, run } from "../github/gh.ts";
import {
	boardWorkflows,
	loadBoard,
	missingColumns,
	neededWorkflows,
	workflowsUrl,
} from "../github/project.ts";
import { probe } from "../probe.ts";
import { LOGIN_FIX, providerLogin } from "../providers/login.ts";
import {
	codexSupports,
	type McpServer,
	readMcpServers,
} from "../providers/mcp.ts";
import {
	FILL_IN,
	NEW_SUFFIX,
	pendingMerges,
	planUpgrade,
	unfilledTemplates,
} from "../templates.ts";
import { REPO_LABELS } from "./board.ts";

type Check = {
	name: string;
	ok: boolean;
	/** Shown with a warning mark; never fails doctor. */
	warn?: boolean;
	detail?: string;
	/** Why it matters. Shown only when the check fails or warns. */
	why?: string;
	fix?: string;
	/** Docs page and anchor, e.g. "configuration#config-file". */
	docs?: string;
};

async function cmd(args: string[]) {
	const p = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
	const [out, err, code] = await Promise.all([
		new Response(p.stdout).text(),
		new Response(p.stderr).text(),
		p.exited,
	]);
	return { ok: code === 0, out: `${out}${err}`.trim() };
}

/** Failure detail and fix for a check, from a thrown error. */
function explain(e: unknown, fallback?: string) {
	const d = describeError(e);
	return {
		detail: d.message,
		why: d.why,
		fix: d.fix ?? fallback,
		docs: d.docs,
	};
}

const indent = (s: string, pad: string) => s.replace(/^(?=.)/gm, pad);

function print(c: Check) {
	const state = c.warn ? "warn" : c.ok ? "ok" : "fail";
	const mark = {
		ok: color.green("✔"),
		warn: color.yellow("!"),
		fail: color.red("✖"),
	}[state];
	if (state === "ok") {
		const detail = c.detail ? color.dim(` — ${c.detail}`) : "";
		console.log(`  ${mark} ${c.name}${detail}`);
		return;
	}
	const paint = state === "warn" ? color.yellow : color.red;
	const lines = [`  ${mark} ${paint(c.name)}`];
	if (c.detail) lines.push(indent(c.detail, "      "));
	if (c.why) lines.push(color.dim(indent(c.why, "      ")));
	if (c.fix) lines.push(`      ${color.bold("Fix:")}  ${color.cyan(c.fix)}`);
	if (c.docs)
		lines.push(
			`      ${color.bold("Docs:")} ${color.dim(`${DOCS_URL}/${c.docs}`)}`,
		);
	console.log(lines.join("\n"));
}

function section(title: string) {
	console.log(`\n${color.bold(title)}`);
}

/** Print totals and next step, then exit 1 if anything failed. */
function summary(checks: Check[]) {
	const failed = checks.filter((c) => !c.ok).length;
	const warned = checks.filter((c) => c.ok && c.warn).length;
	const passed = checks.length - failed - warned;
	const parts = [color.green(`${passed} passed`)];
	if (warned)
		parts.push(
			color.yellow(`${warned} ${warned === 1 ? "warning" : "warnings"}`),
		);
	if (failed) parts.push(color.red(`${failed} failed`));
	console.log(`\n${parts.join(color.dim(" · "))}`);
	if (failed) {
		console.log(
			`Fix the ${color.red("✖")} items above, top to bottom, then run ${color.cyan("kanbot doctor")} again.`,
		);
		process.exit(1);
	}
	if (warned)
		console.log(
			`Ready to run. The ${color.yellow("!")} items are worth a look, but won't stop kanbot.`,
		);
	else console.log(`All set. Start kanbot with ${color.cyan("kanbot run")}.`);
}

export default defineCommand({
	meta: {
		name: "doctor",
		description: "Check that everything kanbot needs is in place",
	},
	args: {
		probe: {
			type: "boolean",
			description:
				"Also run a short agent job to check it can edit files, write skills and commit. Takes a minute of your plan",
			default: false,
		},
	},
	async run({ args }) {
		const root = process.cwd();
		const checks: Check[] = [];
		const add = (c: Check) => {
			checks.push(c);
			print(c);
		};

		console.log(
			`${color.bold("kanbot doctor")} ${color.dim("checks that everything kanbot needs is in place.")}`,
		);

		section("GitHub CLI");
		const auth = await cmd(["gh", "auth", "status"]);
		add({
			name: "gh logged in",
			ok: auth.ok,
			why: "kanbot talks to GitHub through gh.",
			fix: "gh auth login",
			docs: "getting-started#requirements",
		});
		add({
			name: "gh token has project scope",
			ok: /'project'/.test(auth.out),
			why: "Needed to read and move cards on the project board.",
			fix: "gh auth refresh -s project",
			docs: "getting-started#requirements",
		});

		section("Config");

		let config: Awaited<ReturnType<typeof loadConfig>>;
		try {
			config = await loadConfig(root);
			add({
				name: "config",
				ok: true,
				detail: `${config.repo}, provider ${config.provider}`,
			});
		} catch (e) {
			add({ name: "config", ok: false, ...explain(e, "kanbot init") });
			console.log(
				color.dim("\n  The other checks need a config, so doctor stops here."),
			);
			return summary(checks);
		}

		const login = await providerLogin(config.provider);
		if (config.provider === "claude") {
			section("Claude Code");
			add({
				name: "claude CLI logged in with a subscription",
				ok: login.ok,
				detail: login.installed ? login.detail : "claude is not installed.",
				why: "Workers run `claude`. An API key login bills per token instead of your plan.",
				fix: LOGIN_FIX.claude,
				docs: "providers#claude-code",
			});
		} else {
			section("Codex");
			add({
				name: "codex CLI logged in with ChatGPT",
				ok: login.ok,
				detail: login.installed ? login.detail : "codex is not installed.",
				why: "Workers run `codex` on your ChatGPT plan.",
				fix: LOGIN_FIX.codex,
				docs: "providers#codex",
			});
			add({
				name: "codex workers ignore ~/.codex/config.toml",
				ok: true,
				detail:
					"models come from agent frontmatter, MCP servers from .mcp.json; agents that run commands have no sandbox",
			});
		}

		if (args.probe && login.ok) {
			console.log(color.dim("  Running a short agent job…"));
			const fix =
				config.provider === "claude"
					? "remove deny rules for Edit, Write or Bash in .claude/settings.local.json or managed settings"
					: "update codex and kanbot; if your organization manages Codex, ask whether it forces a sandbox";
			for (const c of await probe(root, providerFor(config)))
				add({
					name: c.name,
					ok: c.ok,
					detail: c.detail,
					why: "Jobs need these to finish. See the run with `kanbot logs probe`.",
					fix,
					docs: "providers#permissions",
				});
		} else if (login.ok) {
			console.log(
				color.dim(
					"  Check worker permissions with a real job: kanbot doctor --probe",
				),
			);
		}

		section("Agents and skills");
		try {
			const agents = await loadAgents(root);
			add({
				name: "agents",
				ok: true,
				detail: `${agents.filter((a) => a.tier === "column").length} column, ${agents.filter((a) => a.tier === "sub").length} sub`,
			});
			const needed = [
				"planner",
				"reviewer",
				"acceptance-reviewer",
				"fixer",
				"implementer",
				...Object.values(config.implementers ?? {}),
			];
			const missing = [...new Set(needed)].filter(
				(n) => !agents.some((a) => a.name === n),
			);
			add({
				name: "agents referenced by config exist",
				ok: !missing.length,
				detail: missing.join(", ") || undefined,
				why: "Columns hand work to these agents, but .kanbot/agents has no file for them.",
				fix: "kanbot upgrade",
			});
			if (config.implementers)
				add({
					name: "implementers is deprecated",
					ok: true,
					warn: true,
					detail:
						"implement uses `implementer`; map craft with capabilities instead",
					fix: "remove implementers from .kanbot/config.yml",
				});
			const noSkill = missingSkills(root, agents);
			add({
				name: "skills referenced by agents exist",
				ok: !noSkill.length,
				detail: noSkill.join(", ") || undefined,
				why: "Agents list these skills, but .agents/skills has none by that name.",
				fix: "add them to .agents/skills or remove them from the agent's `skills`",
			});
			add({
				name: "capabilities",
				ok: true,
				detail: capabilitySummary(config.capabilities),
			});
			// Only problems get their own line.
			for (const [name, c] of Object.entries(config.capabilities)) {
				const found = findCapability(root, agents, c.use);
				if (found === "skill" || found === "agent") continue;
				add({
					name: `capability ${name} → ${c.use}`,
					ok: found !== null,
					warn: found !== null,
					detail: found
						? `${found} agent, works on ${found} only`
						: "not found",
					why: found
						? undefined
						: "Jobs that need this capability can't load it.",
					fix: "add the skill to .agents/skills or the agent to .kanbot/agents",
				});
			}
			const stale = await sync(root, agents, { check: true });
			add({
				name: "generated agent files up to date",
				ok: !stale.length,
				detail: stale.join(", ") || undefined,
				why: "Workers read .claude/agents and .codex/agents, which are generated from .kanbot/agents.",
				fix: "kanbot sync",
			});
			add({
				name: "config schema up to date",
				ok: !(await writeConfigSchema(root, { check: true })),
				why: "Editors use it for autocomplete and errors in config.yml.",
				fix: "kanbot sync",
				docs: "configuration",
			});
		} catch (e) {
			add({ name: "agents", ok: false, ...explain(e) });
		}

		const servers = await readMcpServers(root);
		const names = Object.keys(servers);
		const skipped =
			config.provider === "codex"
				? names.filter((n) => !codexSupports(servers[n] as McpServer))
				: [];
		add({
			name: "MCP servers for workers (.mcp.json)",
			ok: true,
			warn: skipped.length > 0,
			detail: [
				names.join(", ") || "none",
				skipped.length ? `codex can't run: ${skipped.join(", ")}` : "",
			]
				.filter(Boolean)
				.join("; "),
		});

		section("Templates");
		const plan = await planUpgrade(root);
		const behind = plan.changes.filter((c) =>
			["add", "update", "conflict"].includes(c.action),
		);
		add({
			name: "templates up to date",
			ok: !behind.length,
			detail: behind.length
				? `${behind.length} file(s) differ from this kanbot version`
				: undefined,
			why: "You get fixes to agents, skills and workflows by upgrading.",
			fix: "kanbot upgrade",
			docs: "upgrading",
		});
		const merges = await pendingMerges(root);
		add({
			name: `no unmerged ${NEW_SUFFIX} files`,
			ok: !merges.length,
			detail: merges.join(", ") || undefined,
			why: "upgrade put the new version next to files you changed.",
			docs: "upgrading",
			fix: `merge each into the file next to it and delete it (kanbot-admin skill can help)`,
		});

		const unfilled = await unfilledTemplates(root);
		for (const path of FILL_IN) {
			const u = unfilled.find((x) => x.path === path);
			const conventions = path.includes("project-conventions");
			add({
				name: `${path} filled in`,
				ok: true,
				warn: !!u,
				detail: u?.detail,
				why: u
					? conventions
						? "Every agent reads it first for commands and conventions. Until it's filled in, they guess."
						: "Agents fix failing CI, so it should run your real install, lint and test commands."
					: undefined,
				fix: u
					? conventions
						? "replace each <placeholder> and delete the TEMPLATE note (kanbot-guide skill can help)"
						: "replace the starter steps with your stack's commands"
					: undefined,
				docs: conventions
					? "project-conventions#fill-it-in"
					: "getting-started#set-up-a-repository",
			});
		}

		section(`Pushed to origin/${config.baseBranch}`);
		await git(root, "fetch", "origin", config.baseBranch).catch(() => {});
		const tree = await git(
			root,
			"ls-tree",
			"-r",
			"--name-only",
			`origin/${config.baseBranch}`,
		).catch(() => "");
		for (const path of [
			".agents/skills/",
			".claude/agents/",
			".codex/agents/",
			"AGENTS.md",
		]) {
			add({
				name: `${path} committed on origin/${config.baseBranch}`,
				ok: tree.split("\n").some((f) => f.startsWith(path)),
				why: "Workers run in worktrees made from the base branch, so they only see what is pushed.",
				fix: "commit and push the kanbot files",
			});
		}
		add({
			name: ".github/workflows/kanbot-merged.yml",
			ok: existsSync(join(root, ".github/workflows/kanbot-merged.yml")),
			why: "Closes the other approaches' PRs when one is merged.",
			fix: "kanbot upgrade",
		});

		section("Project board");
		const gh = new Gh(config.repo);
		try {
			const board = await loadBoard(gh, config);
			const missing = missingColumns(board);
			add({
				name: "project board",
				ok: !missing.length,
				detail: missing.length
					? `missing columns: ${missing.join(", ")}`
					: board.url,
				why: missing.length
					? "kanbot moves cards by the column names in config.yml."
					: undefined,
				fix: "kanbot board create",
				docs: "getting-started#create-the-board",
			});
			// Moving cards to Done on close/merge and adding new issues are left to GitHub.
			const workflows = await boardWorkflows(gh, board);
			for (const w of neededWorkflows(config)) {
				const on = workflows.some((x) => x.name === w.name && x.enabled);
				add({
					name: `board workflow "${w.name}" enabled`,
					ok: on || !w.required,
					warn: !on && !w.required,
					why: w.required
						? "kanbot leaves adding new issues and moving closed ones to Done to GitHub."
						: `Without it, new issues land with no Status and kanbot ignores them until you set one.`,
					fix: `open ${workflowsUrl(board)} → "${w.name}" → ${w.set} → turn it on`,
					docs: "getting-started#create-the-board",
				});
			}
		} catch (e) {
			add({
				name: "project board",
				ok: false,
				...explain(e, "kanbot board create"),
			});
		}

		const labels = (
			JSON.parse(
				await run([
					"label",
					"list",
					"--repo",
					config.repo,
					"--limit",
					"200",
					"--json",
					"name",
				]),
			) as { name: string }[]
		).map((l) => l.name);
		const missingLabels = REPO_LABELS.map(([n]) => n).filter(
			(n) => !labels.includes(n),
		);
		add({
			name: "labels",
			ok: !missingLabels.length,
			detail: missingLabels.length
				? `missing: ${missingLabels.join(", ")}`
				: undefined,
			why: "kanbot tags issues and PRs with these labels.",
			fix: "kanbot board create",
		});

		const { mode, app } = config.identity;
		if (mode === "app") {
			section("GitHub App");
			add({
				name: "kanbot app set",
				ok: app !== null,
				detail: app ? `${app.slug} (id ${app.id})` : undefined,
				why: "identity.mode is app, so kanbot acts as a GitHub App.",
				fix: "kanbot app create",
			});
			if (app) {
				const key = appKeyPath(app.id);
				add({
					name: "kanbot app private key",
					ok: existsSync(key),
					detail: key,
					why: "kanbot signs in as the app with this key.",
					fix: "kanbot app create, or copy the key from the machine that created the app",
				});
				if (existsSync(key)) {
					try {
						await appTokens(app, config.repo)();
						add({ name: `kanbot app installed on ${config.repo}`, ok: true });
					} catch (e) {
						add({
							name: `kanbot app installed on ${config.repo}`,
							ok: false,
							...explain(
								e,
								`https://github.com/apps/${app.slug}/installations/new`,
							),
						});
					}
				}
			}
		}

		if (config.review.copilot) {
			section("Copilot review");
			const rule = await copilotReviewRule(gh, config.baseBranch).catch(
				() => null,
			);
			add({
				name: "Copilot review requested on PRs",
				ok: rule !== null,
				detail: rule
					? `re-review on push: ${rule.parameters?.review_on_push ? "on" : "off"}`
					: "review.copilot is on, but no ruleset requests Copilot review",
				fix: "kanbot board create",
				docs: "copilot-review",
			});
			add({
				name: ".github/copilot-instructions.md committed",
				why: "Copilot reads it to review the way your team wants.",
				ok: tree.split("\n").includes(".github/copilot-instructions.md"),
				fix: "kanbot sync, then commit and push",
			});
		}

		summary(checks);
	},
});
