import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { UserError } from "../errors.ts";

/** One daemon per repo. Stale locks (dead pid) are taken over. */
export async function acquireLock(root: string): Promise<() => void> {
	const file = join(root, ".kanbot", "daemon.pid");
	if (existsSync(file)) {
		const pid = Number(await Bun.file(file).text());
		if (pid && isAlive(pid)) {
			throw new UserError("kanbot is already running for this repo.", {
				why: `Process ${pid} holds .kanbot/daemon.pid. Only one daemon runs per repo.`,
				fix: `Stop it with \`kill ${pid}\`, or check it with \`kanbot status\`.`,
				docs: "usage#kanbot-run",
			});
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
