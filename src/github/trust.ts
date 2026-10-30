import type { Gh } from "./gh.ts";

const WRITE = new Set(["admin", "maintain", "write"]);
const TTL_MS = 60 * 60 * 1000;

/**
 * Only comments from collaborators with write access may steer agents. This is
 * the main prompt-injection guard on public repos.
 */
export class Trust {
	private cache = new Map<string, { ok: boolean; at: number }>();

	constructor(private gh: Gh) {}

	async isTrusted(login: string): Promise<boolean> {
		const hit = this.cache.get(login);
		if (hit && Date.now() - hit.at < TTL_MS) return hit.ok;
		let ok = false;
		try {
			const res = await this.gh.rest<{ permission: string }>(
				this.gh.r(`/collaborators/${encodeURIComponent(login)}/permission`),
			);
			ok = WRITE.has(res.permission);
		} catch {
			ok = false;
		}
		this.cache.set(login, { ok, at: Date.now() });
		return ok;
	}

	async resolve(logins: Iterable<string>): Promise<Set<string>> {
		const unique = [...new Set(logins)];
		const results = await Promise.all(
			unique.map(async (l) => [l, await this.isTrusted(l)] as const),
		);
		return new Set(results.filter(([, ok]) => ok).map(([l]) => l));
	}
}
