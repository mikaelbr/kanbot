import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

/** One daemon per repo. Stale locks (dead pid) are taken over. */
export async function acquireLock(root: string): Promise<() => void> {
	const file = join(root, ".autogh", "daemon.pid");
	if (existsSync(file)) {
		const pid = Number(await Bun.file(file).text());
		if (pid && isAlive(pid)) {
			throw new Error(`autogh is already running for this repo (pid ${pid})`);
		}
	}
	await Bun.write(file, String(process.pid));
	return () => rmSync(file, { force: true });
}

function isAlive(pid: number) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
