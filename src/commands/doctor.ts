import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineCommand } from "citty";
import { loadAgents } from "../agents/load.ts";
import { sync } from "../agents/sync.ts";
import { loadConfig, writeConfigSchema } from "../config.ts";
import { git } from "../daemon/git.ts";
import { describeError } from "../errors.ts";
import { copilotReviewRule } from "../github/api.ts";
import { appKeyPath, appTokens } from "../github/app.ts";
import { Gh, run } from "../github/gh.ts";
import {
	boardWorkflows,
	loadBoard,
	missingColumns,
} from "../github/project.ts";
import { NEW_SUFFIX, pendingMerges, planUpgrade } from "../templates.ts";
import { REPO_LABELS } from "./board.ts";

type Check = { name: string; ok: boolean; detail?: string; fix?: string };

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
	const detail = [d.message, d.why].filter(Boolean).join("\n");
	return {
		detail: detail.replace(/\n/g, "\n    "),
		fix: d.fix ?? fallback,
	};
}

export default defineCommand({
	meta: {
		name: "doctor",
		description: "Check that everything kanbot needs is in place",
	},
	async run() {
		const root = process.cwd();
		const checks: Check[] = [];
		const add = (c: Check) => {
			checks.push(c);
			console.log(
				`${c.ok ? "✔" : "✖"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}${!c.ok && c.fix ? `\n    fix: ${c.fix}` : ""}`,
			);
		};

		const auth = await cmd(["gh", "auth", "status"]);
		add({ name: "gh logged in", ok: auth.ok, fix: "gh auth login" });
		add({
			name: "gh token has project scope",
			ok: /'project'/.test(auth.out),
			fix: "gh auth refresh -s project",
		});

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
			return process.exit(1);
		}

		if (config.provider === "claude") {
			const s = await cmd(["claude", "auth", "status"]);
			const sub = /"authMethod":\s*"claude\.ai"/.test(s.out);
			add({
				name: "claude CLI logged in with a subscription",
				ok: s.ok && sub,
				detail: sub
					? undefined
					: "not using a claude.ai login (would bill API usage)",
				fix: "claude auth login",
			});
		} else {
			const s = await cmd(["codex", "login", "status"]);
			add({
				name: "codex CLI logged in with ChatGPT",
				ok: s.ok && /ChatGPT/i.test(s.out),
				detail: s.out.split("\n")[0],
				fix: "codex login",
			});
		}

		try {
			const agents = await loadAgents(root);
			add({
				name: "agents",
				ok: true,
				detail: `${agents.filter((a) => a.tier === "column").length} column, ${agents.filter((a) => a.tier === "sub").length} sub`,
			});
			const needed = [
				"planner",
				"reviewer-code",
				"reviewer-spec",
				"fixer",
				...Object.values(config.implementers),
			];
			const missing = [...new Set(needed)].filter(
				(n) => !agents.some((a) => a.name === n),
			);
			add({
				name: "agents referenced by config exist",
				ok: !missing.length,
				detail: missing.join(", ") || undefined,
			});
			const stale = await sync(root, agents, { check: true });
			add({
				name: "generated agent files up to date",
				ok: !stale.length,
				detail: stale.join(", ") || undefined,
				fix: "kanbot sync",
			});
			add({
				name: "config schema up to date",
				ok: !(await writeConfigSchema(root, { check: true })),
				fix: "kanbot sync",
			});
		} catch (e) {
			add({ name: "agents", ok: false, ...explain(e) });
		}

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
			fix: "kanbot upgrade",
		});
		const merges = await pendingMerges(root);
		add({
			name: `no unmerged ${NEW_SUFFIX} files`,
			ok: !merges.length,
			detail: merges.join(", ") || undefined,
			fix: `merge each into the file next to it and delete it (kanbot-admin skill can help)`,
		});

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
				detail: "worktrees are created from the base branch",
				fix: "commit and push the kanbot files",
			});
		}
		add({
			name: ".github/workflows/kanbot-merged.yml",
			ok: existsSync(join(root, ".github/workflows/kanbot-merged.yml")),
		});

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
				fix: "kanbot board create",
			});
			// Moving cards to Done on close/merge and adding new issues are left to GitHub.
			const workflows = await boardWorkflows(gh, board);
			for (const name of [
				"Item closed",
				"Pull request merged",
				"Auto-add to project",
			]) {
				add({
					name: `board workflow "${name}" enabled`,
					ok: workflows.some((w) => w.name === name && w.enabled),
					fix: `enable it in ${board.url} → ⋯ → Workflows`,
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
			detail: missingLabels.join(", ") || undefined,
			fix: "kanbot board create",
		});

		const { mode, app } = config.identity;
		if (mode === "app") {
			add({
				name: "kanbot app set",
				ok: app !== null,
				detail: app ? `${app.slug} (id ${app.id})` : undefined,
				fix: "kanbot app create",
			});
			if (app) {
				const key = appKeyPath(app.id);
				add({
					name: "kanbot app private key",
					ok: existsSync(key),
					detail: key,
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
			});
			add({
				name: ".github/copilot-instructions.md committed",
				ok: tree.split("\n").includes(".github/copilot-instructions.md"),
				fix: "kanbot sync, then commit and push",
			});
		}

		if (checks.some((c) => !c.ok)) process.exit(1);
	},
});
