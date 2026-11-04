import { type AgentDef, loadAgents } from "../agents/load.ts";
import { sync } from "../agents/sync.ts";
import { type Config, loadConfig } from "../config.ts";
import { UserError } from "../errors.ts";
import { viewer } from "../github/api.ts";
import { botClient, missingReadPermissions } from "../github/app.ts";
import { Gh, isApiRateLimit } from "../github/gh.ts";
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
import { type Action, derive, type Job, schedule, wipFull } from "./derive.ts";
import { Worktrees } from "./git.ts";
import { acquireLock } from "./lock.ts";
import { Notifier } from "./notify.ts";
import { SnapshotCache, takeSnapshot } from "./snapshot.ts";
import { State } from "./state.ts";

export type RunOptions = { once: boolean; dryRun: boolean };

const RATE_LIMIT_PAUSE_MS = 30 * 60_000;
/** Pause after a GitHub secondary rate limit, which has no reset time. */
const SECONDARY_PAUSE_MS = 5 * 60_000;

export function providerFor(config: Config): Provider {
	return config.provider === "codex" ? codex : claude;
}

/** Config that only takes effect on restart: clients and board are built once. */
const RESTART_KEYS = [
	"repo",
	"baseBranch",
	"project",
	"columns",
	"identity",
] as const;

async function warnStale(root: string, agents: AgentDef[]) {
	const changed = await sync(root, agents, { check: true });
	if (changed.length) {
		log.warn(
			`Generated agent files are stale (${changed.join(", ")}). Run \`kanbot sync\` and commit.`,
		);
	}
}

export async function runDaemon(root: string, opts: RunOptions) {
	const config = await loadConfig(root);
	const agents = await loadAgents(root);
	await warnStale(root, agents);
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
	const bot = botClient(config, gh);
	const deps: JobDeps = {
		root,
		config,
		gh,
		bot,
		me: await viewer(gh),
		board,
		agents,
		provider: providerFor(config),
		worktrees: new Worktrees(root, config.repo, config.baseBranch, opts.dryRun),
		notify: new Notifier(config.notify),
		state,
	};
	const reads = await readClient(config, gh, bot);
	const trust = new Trust(gh);
	const cache = new SnapshotCache();
	let apiPausedUntil = 0;
	const running = new Map<string, Promise<void>>();
	let wake: () => void = () => {};
	// kanbot-review PRs vanish from the snapshot when closed; clean up after them.
	let prOnly = new Set<number>();
	let wasFull = false;
	let stopping = false;
	let rootSkipped: string | undefined;

	const stop = () => {
		if (stopping) process.exit(1);
		stopping = true;
		log.info("Stopping after running jobs finish (Ctrl-C again to force)…");
		wake();
	};
	process.on("SIGINT", stop);
	process.on("SIGTERM", stop);

	log.info(
		`kanbot: ${config.repo} · ${board.url} · provider ${config.provider} · ${config.concurrency} workers · talks as ${config.identity.mode === "app" ? `${config.identity.app?.slug}[bot]` : deps.me}${opts.dryRun ? " · DRY RUN" : ""}`,
	);

	try {
		while (!stopping) {
			if (Date.now() < apiPausedUntil) {
				// Logged once when the pause started.
			} else if (Date.now() < state.pausedUntil) {
				log.info(
					`Paused for rate limits until ${new Date(state.pausedUntil).toLocaleTimeString()}`,
				);
			} else {
				await tick().catch((e) =>
					isApiRateLimit(e)
						? pauseApi()
						: log.error(`tick failed: ${e instanceof Error ? e.message : e}`),
				);
			}
			if (opts.once) break;
			await new Promise<void>((resolve) => {
				// Clear the timer on wake so Ctrl-C doesn't wait out the poll interval.
				const timer = setTimeout(resolve, deps.config.pollSeconds * 1000);
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

	/** Wait out GitHub's API rate limit instead of failing every tick. */
	async function pauseApi() {
		if (Date.now() < apiPausedUntil) return;
		const resets = await Promise.all(
			[...new Set([gh, reads])].map((c) =>
				c.rateLimitReset().catch(() => null),
			),
		);
		const reset = Math.max(...resets.map((r) => r ?? 0));
		apiPausedUntil =
			reset > Date.now() ? reset : Date.now() + SECONDARY_PAUSE_MS;
		log.warn(
			`GitHub API rate limit hit. Pausing until ${new Date(apiPausedUntil).toLocaleTimeString()}. Agents' \`gh\` calls share your limit; fewer workers or a higher pollSeconds help.`,
		);
	}

	/** Keep the checkout at origin/<base>; reload config and agents when it moves. */
	async function updateRoot() {
		const { moved, skipped } = await deps.worktrees.updateRoot();
		if (skipped !== rootSkipped && skipped)
			log.warn(
				`Can't update ${root} to origin/${config.baseBranch}: ${skipped}. Config and agents may be stale; \`kanbot doctor\` explains.`,
			);
		rootSkipped = skipped;
		if (!moved) return;
		const next = await loadConfig(root);
		const restart = RESTART_KEYS.filter(
			(k) => JSON.stringify(next[k]) !== JSON.stringify(config[k]),
		);
		if (restart.length)
			log.warn(
				`Config changed ${restart.join(", ")}. Restart kanbot to apply them.`,
			);
		for (const k of RESTART_KEYS) Object.assign(next, { [k]: config[k] });
		deps.config = next;
		deps.provider = providerFor(next);
		deps.notify = new Notifier(next.notify);
		deps.agents = await loadAgents(root);
		await warnStale(root, deps.agents);
		log.info(
			`Updated to origin/${config.baseBranch}; reloaded config and agents.`,
		);
	}

	async function tick() {
		if (!opts.dryRun) {
			await deps.worktrees.fetch();
			await updateRoot().catch((e) =>
				log.warn(`update checkout: ${e instanceof Error ? e.message : e}`),
			);
		}
		const config = deps.config;
		const snapshot = await takeSnapshot(gh, board, trust, { reads, cache });
		const { jobs, actions } = derive(snapshot, {
			config,
			running: new Set(running.keys()),
			failures: state.failures,
			now: Date.now(),
		});
		const wip = wipFull(snapshot, config);
		if (wip.full !== wasFull) {
			if (wip.full)
				log.warn(
					`WIP limit: ${wip.waiting} item(s) wait on you (limit ${wip.limit}). No new Ready cards start. See \`kanbot status\`.`,
				);
			else log.info("WIP limit cleared; Ready cards start again.");
			wasFull = wip.full;
		}
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
					`${job.key}: ${msg}; pausing all work for ${RATE_LIMIT_PAUSE_MS / 60_000} min`,
				);
				// Tell GitHub once per outage, not on every retry.
				if (await state.pause(RATE_LIMIT_PAUSE_MS)) {
					await applyAction(
						{
							kind: "paused",
							number: job.item.issue.number,
							why: msg.slice(0, 500),
							minutes: RATE_LIMIT_PAUSE_MS / 60_000,
						},
						deps,
					).catch(() => {});
				}
			} else if (isApiRateLimit(e)) {
				log.warn(`${job.key}: ${msg}; retries after the pause`);
				await pauseApi();
			} else if (e instanceof NeedsHuman) {
				log.warn(`${job.key}: needs human (${msg})`);
			} else {
				const n = await state.fail(job.key);
				log.error(
					`${job.key} failed (attempt ${n}/${deps.config.maxAttempts}): ${msg}`,
				);
				if (n >= deps.config.maxAttempts) {
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

/**
 * Issue and PR reads go through the app when it can, so they don't spend the
 * user's rate limit. The board stays on the user: apps can't read user projects.
 */
async function readClient(config: Config, gh: Gh, bot: Gh) {
	const { app } = config.identity;
	if (!bot.isBot || !app) return gh;
	const missing = await missingReadPermissions(app, config.repo).catch(
		() => null,
	);
	if (missing?.length === 0) return bot;
	if (missing)
		log.warn(
			`The kanbot app can't read ${missing.join(", ")}, so reads use your rate limit. \`kanbot doctor\` shows the fix.`,
		);
	return gh;
}

function describeAction(a: Action) {
	switch (a.kind) {
		case "move":
			return `move #${a.item.issue.number} → ${a.to}`;
		case "label":
			return `label #${a.number} +[${a.add}] -[${a.remove}]`;
		case "agentReviewed":
			return `mark PR #${a.pr.number} agent-reviewed`;
		case "merge":
			return `merge PR #${a.pr.number}, approved by ${a.by}`;
		case "compare":
			return `post comparison on #${a.item.issue.number}`;
		case "needsHuman":
			return `needs-human #${a.number}`;
		case "paused":
			return `post pause on #${a.number}`;
		case "openQuestions":
			return `open questions on #${a.item.issue.number}`;
		case "waiting":
			return `#${a.item.issue.number} waits on ${a.blockers.join(", ")}`;
		case "resetFailures":
			return `reset failures ${a.prefix}`;
		case "cleanup":
			return `cleanup worktrees of #${a.number}`;
	}
}
