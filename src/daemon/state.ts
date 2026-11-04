import { existsSync } from "node:fs";
import { join } from "node:path";

type Data = {
	failures: Record<string, number>;
	pausedUntil: number;
	/** A pause was posted to GitHub and no job has succeeded since. */
	pauseNoticed: boolean;
};

/**
 * The only local state: failure counts and a rate-limit pause. Everything else
 * is derived from GitHub on each tick, so deleting this file is always safe.
 */
export class State {
	private data: Data = { failures: {}, pausedUntil: 0, pauseNoticed: false };
	private readonly file: string;

	constructor(root: string) {
		this.file = join(root, ".kanbot", "state.json");
	}

	async load() {
		if (existsSync(this.file)) {
			this.data = { ...this.data, ...(await Bun.file(this.file).json()) };
		}
		return this;
	}

	private save() {
		return Bun.write(this.file, JSON.stringify(this.data, null, 2));
	}

	get failures(): ReadonlyMap<string, number> {
		return new Map(Object.entries(this.data.failures));
	}

	async fail(key: string) {
		this.data.failures[key] = (this.data.failures[key] ?? 0) + 1;
		await this.save();
		return this.data.failures[key];
	}

	async succeed(key: string) {
		if (!(key in this.data.failures) && !this.data.pauseNoticed) return;
		delete this.data.failures[key];
		this.data.pauseNoticed = false;
		await this.save();
	}

	async resetFailures(prefix: string) {
		for (const k of Object.keys(this.data.failures)) {
			if (k.includes(prefix)) delete this.data.failures[k];
		}
		await this.save();
	}

	get pausedUntil() {
		return this.data.pausedUntil;
	}

	/** Returns true on the first pause since the last success. */
	async pause(ms: number) {
		this.data.pausedUntil = Date.now() + ms;
		const first = !this.data.pauseNoticed;
		this.data.pauseNoticed = true;
		await this.save();
		return first;
	}
}
