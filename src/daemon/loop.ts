import { loadAgents } from "../agents/load.ts";
import { sync } from "../agents/sync.ts";
import { type Config, loadConfig } from "../config.ts";
import { UserError } from "../errors.ts";
import { Gh } from "../github/gh.ts";
import { loadBoard, missingColumns } from "../github/project.ts";
import { Trust } from "../github/trust.ts";
import {
	applyAction,
	type JobDeps,
	NeedsHuman,
	RateLimited,
	runJob,
} from "../jobs/run.ts";
import { log } from "../log.ts";
import { claude } from "../providers/claude.ts";
import { codex } from "../providers/codex.ts";
import type { Provider } from "../providers/types.ts";
import { type Action, derive, type Job, schedule } from "./derive.ts";
import { Worktrees } from "./git.ts";
import { acquireLock } from "./lock.ts";
import { Notifier } from "./notify.ts";
import { takeSnapshot } from "./snapshot.ts";
import { State } from "./state.ts";

export type RunOptions = { once: boolean; dryRun: boolean };

const RATE_LIMIT_PAUSE_MS = 30 * 60_000;

export function providerFor(config: Config): Provider {
	return config.provider === "codex"
		? codex({ networkAccess: config.codex.networkAccess })
		: claude;
}

export async function runDaemon(root: string, opts: RunOptions) {
	const config = await loadConfig(root);
	const agents = await loadAgents(root);
	const changed = await sync(root, agents, { check: true });
	if (changed.length) {
		log.warn(
			`Generated agent files are stale (${changed.join(", ")}). Run \`kanbot sync\` and commit.`,
		);
	}
	const gh = new Gh(config.repo, opts.dryRun);
	const board = await loadBoard(gh, config);
	const missing = missingColumns(board);
	if (missing.length)
		throw new UserError("The project board is missing columns.", {
			why: `No Status option for: ${missing.map((k) => config.columns[k]).join(", ")}.`,
			fix: "kanbot board create adds them. Or match `columns` in .kanbot/config.yml to your board.",
			docs: "configuration#columns",
		});

	const release = opts.dryRun ? () => {} : await acquireLock(root);
	const state = await new State(root).load();
	const deps: JobDeps = {
		root,
		config,
		gh,
		board,
		agents,
		provider: providerFor(config),
		worktrees: new Worktrees(root, config.repo, config.baseBranch, opts.dryRun),
		notify: new Notifier(config.notify),
		state,
	};
	const trust = new Trust(gh);
	const running = new Map<string, Promise<void>>();
	let wake: () => void = () => {};
	// kanbot-review PRs vanish from the snapshot when closed; clean up after them.
	let prOnly = new Set<number>();
	let stopping = false;

	const stop = () => {
		if (stopping) process.exit(1);
		stopping = true;
		log.info("Stopping after running jobs finish (Ctrl-C again to force)…");
		wake();
	};
	process.on("SIGINT", stop);
	process.on("SIGTERM", stop);

	log.info(
		`kanbot: ${config.repo} · ${board.url} · provider ${config.provider} · ${config.concurrency} workers${opts.dryRun ? " · DRY RUN" : ""}`,
	);

	try {
		while (!stopping) {
			if (Date.now() < state.pausedUntil) {
				log.info(
					`Paused for rate limits until ${new Date(state.pausedUntil).toLocaleTimeString()}`,
				);
			} else {
				await tick().catch((e) =>
					log.error(`tick failed: ${e instanceof Error ? e.message : e}`),
				);
			}
			if (opts.once) break;
			await new Promise<void>((resolve) => {
				// Clear the timer on wake so Ctrl-C doesn't wait out the poll interval.
				const timer = setTimeout(resolve, config.pollSeconds * 1000);
				wake = () => {
					clearTimeout(timer);
					resolve();
				};
			});
		}
		await Promise.allSettled(running.values());
	} finally {
		release();
	}

	async function tick() {
		if (!opts.dryRun) await deps.worktrees.fetch();
		const snapshot = await takeSnapshot(gh, board, trust);
		const { jobs, actions } = derive(snapshot, {
			config,
			running: new Set(running.keys()),
			failures: state.failures,
			now: Date.now(),
		});
		const nowPrOnly = new Set(
			snapshot.items.filter((i) => i.issue.prOnly).map((i) => i.issue.number),
		);
		for (const n of prOnly) {
			if (nowPrOnly.has(n)) continue;
			// Retry next tick while a job still uses the worktree.
			if ([...running.keys()].some((k) => k.includes(`#${n}:`)))
				nowPrOnly.add(n);
			else actions.push({ kind: "cleanup", number: n });
		}
		prOnly = nowPrOnly;
		for (const a of actions) {
			if (a.kind === "cleanup" && opts.dryRun) continue;
			if (opts.dryRun) log.info(`[dry-run] action ${describeAction(a)}`);
			await applyAction(a, deps).catch((e) =>
				log.error(`action ${a.kind} failed: ${e}`),
			);
		}
		const picked = schedule(
			jobs,
			config.concurrency - running.size,
			config.priority,
		);
		log.debug(
			`${jobs.length} job(s) waiting, ${running.size} running, starting ${picked.length}`,
		);
		for (const job of picked) {
			if (opts.dryRun) {
				log.info(`[dry-run] would start ${job.key}`);
				continue;
			}
			running.set(job.key, start(job));
		}
	}

	async function start(job: Job) {
		try {
			await runJob(job, deps);
			await state.succeed(job.key);
			log.info(`✔ ${job.key}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (e instanceof RateLimited) {
				log.warn(
					`${job.key}: rate limited; pausing all work for ${RATE_LIMIT_PAUSE_MS / 60_000} min`,
				);
				await state.pause(RATE_LIMIT_PAUSE_MS);
			} else if (e instanceof NeedsHuman) {
				log.warn(`${job.key}: needs human (${msg})`);
			} else {
				const n = await state.fail(job.key);
				log.error(
					`${job.key} failed (attempt ${n}/${config.maxAttempts}): ${msg}`,
				);
				if (n >= config.maxAttempts) {
					await applyAction(
						{
							kind: "needsHuman",
							number: job.item.issue.number,
							why: `\`${job.key}\` failed ${n} times. Last error:\n\n\`\`\`\n${msg.slice(0, 1500)}\n\`\`\``,
						},
						deps,
					).catch(() => {});
				}
			}
		} finally {
			running.delete(job.key);
			wake();
		}
	}
}

function describeAction(a: Action) {
	switch (a.kind) {
		case "move":
			return `move #${a.item.issue.number} → ${a.to}`;
		case "label":
			return `label #${a.number} +[${a.add}] -[${a.remove}]`;
		case "agentReviewed":
			return `mark PR #${a.pr.number} agent-reviewed`;
		case "compare":
			return `post comparison on #${a.item.issue.number}`;
		case "needsHuman":
			return `needs-human #${a.number}`;
		case "resetFailures":
			return `reset failures ${a.prefix}`;
		case "cleanup":
			return `cleanup worktrees of #${a.number}`;
	}
}
