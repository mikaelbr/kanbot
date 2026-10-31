import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { log } from "../log.ts";

export async function git(cwd: string, ...args: string[]): Promise<string> {
	const proc = Bun.spawn(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0)
		throw new Error(
			`git ${args.join(" ")} failed: ${err.trim() || out.trim()}`,
		);
	return out.trim();
}

/**
 * One git worktree per job, outside the repo so the human's checkout and
 * tooling never see agent work in progress. Worktrees are reused per key.
 */
export class Worktrees {
	readonly dir: string;
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		readonly root: string,
		repo: string,
		readonly base: string,
		readonly dryRun = false,
	) {
		this.dir = join(homedir(), ".kanbot", "worktrees", repo.replace("/", "__"));
	}

	/**
	 * Run git operations that touch the shared repo (.git/config, refs, the
	 * worktree list) one at a time; parallel jobs otherwise race on its locks.
	 */
	private serial<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.queue.then(fn, fn);
		this.queue = run.catch(() => {});
		return run;
	}

	private path(name: string) {
		return join(this.dir, name.replace(/[^a-zA-Z0-9._-]/g, "_"));
	}

	fetch() {
		return this.serial(() => git(this.root, "fetch", "--prune", "origin"));
	}

	async remoteHas(branch: string) {
		return (
			(await git(this.root, "ls-remote", "--heads", "origin", branch)).length >
			0
		);
	}

	/**
	 * Check out `branch` in its own worktree. Starts from origin/<branch> when it
	 * exists remotely (resuming), otherwise from origin/<base>.
	 */
	checkout(name: string, branch: string): Promise<string> {
		return this.serial(() => this.checkoutNow(name, branch));
	}

	private async checkoutNow(name: string, branch: string) {
		const path = this.path(name);
		const from = (await this.remoteHas(branch))
			? `origin/${branch}`
			: `origin/${this.base}`;
		await mkdir(this.dir, { recursive: true });
		if (!existsSync(path)) {
			await git(
				this.root,
				"worktree",
				"add",
				"--force",
				"--no-track",
				"-B",
				branch,
				path,
				from,
			);
		} else {
			await git(path, "checkout", "--force", "--no-track", "-B", branch, from);
			await git(path, "reset", "--hard", from);
			// Keep ignored files (node_modules) so installs stay warm.
			await git(path, "clean", "-fd");
		}
		return path;
	}

	/** Read-only snapshot of the base branch for planning. */
	detached(name: string): Promise<string> {
		return this.serial(() => this.detachedNow(name));
	}

	private async detachedNow(name: string) {
		const path = this.path(name);
		await mkdir(this.dir, { recursive: true });
		const ref = `origin/${this.base}`;
		if (!existsSync(path)) {
			await git(this.root, "worktree", "add", "--force", "--detach", path, ref);
		} else {
			await git(path, "checkout", "--force", "--detach", ref);
			await git(path, "clean", "-fd");
		}
		return path;
	}

	/** Commit anything the agent left uncommitted. */
	async commitAll(path: string, message: string) {
		if (!(await git(path, "status", "--porcelain"))) return;
		await git(path, "add", "-A");
		await git(path, "commit", "-m", message, "--no-verify");
	}

	/**
	 * Merge `ref` into HEAD. Returns the conflicted files, leaving the merge in
	 * progress for an agent to resolve; empty when it merged cleanly.
	 */
	async merge(path: string, ref: string): Promise<string[]> {
		try {
			await git(path, "merge", "--no-edit", "--no-verify", ref);
			return [];
		} catch (e) {
			const files = await git(path, "diff", "--name-only", "--diff-filter=U");
			if (!files) throw e;
			return files.split("\n");
		}
	}

	/** Stage everything and commit the merge in progress, if any. */
	async concludeMerge(path: string) {
		await git(path, "add", "-A");
		const merging = await git(path, "rev-parse", "-q", "--verify", "MERGE_HEAD")
			.then(() => true)
			.catch(() => false);
		if (merging) await git(path, "commit", "--no-edit", "--no-verify");
	}

	async isAncestor(path: string, ref: string) {
		return git(path, "merge-base", "--is-ancestor", ref, "HEAD")
			.then(() => true)
			.catch(() => false);
	}

	async commitsAhead(path: string, of: string) {
		return Number(await git(path, "rev-list", "--count", `${of}..HEAD`));
	}

	async head(path: string) {
		return git(path, "rev-parse", "HEAD");
	}

	async push(path: string, branch: string) {
		if (this.dryRun) return log.info(`[dry-run] push ${branch}`);
		await this.serial(() =>
			git(
				path,
				"push",
				"--force-with-lease",
				"origin",
				`HEAD:refs/heads/${branch}`,
			),
		);
	}

	async remove(prefix: string) {
		if (!existsSync(this.dir)) return;
		for (const name of await readdir(this.dir)) {
			if (!name.startsWith(prefix)) continue;
			await this.serial(() =>
				git(this.root, "worktree", "remove", "--force", join(this.dir, name)),
			).catch((e) => log.warn(String(e)));
		}
	}
}
