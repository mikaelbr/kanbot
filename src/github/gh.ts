import { log } from "../log.ts";

/**
 * Thin wrapper over the `gh` CLI so autogh reuses the user's existing auth.
 * Reads always run; writes are skipped (and logged) in dry-run mode.
 */
export class Gh {
	constructor(
		readonly repo: string,
		readonly dryRun = false,
	) {}

	get owner() {
		return this.repo.split("/")[0] as string;
	}
	get name() {
		return this.repo.split("/")[1] as string;
	}

	async query<T>(
		query: string,
		variables: Record<string, unknown> = {},
	): Promise<T> {
		const out = await run(
			["api", "graphql", "--input", "-"],
			JSON.stringify({ query, variables }),
		);
		const json = JSON.parse(out) as { data: T; errors?: { message: string }[] };
		if (json.errors?.length) {
			throw new Error(
				`GraphQL: ${json.errors.map((e) => e.message).join("; ")}`,
			);
		}
		return json.data;
	}

	async mutate<T>(
		what: string,
		query: string,
		variables: Record<string, unknown> = {},
	): Promise<T | null> {
		if (this.dryRun) {
			log.info(`[dry-run] ${what}`);
			return null;
		}
		return this.query<T>(query, variables);
	}

	async rest<T = unknown>(path: string): Promise<T> {
		return JSON.parse(await run(["api", path])) as T;
	}

	async restWrite<T = unknown>(
		what: string,
		method: "POST" | "PATCH" | "PUT" | "DELETE",
		path: string,
		body?: unknown,
	): Promise<T | null> {
		if (this.dryRun) {
			log.info(`[dry-run] ${what}`);
			return null;
		}
		const out = await run(
			[
				"api",
				"-X",
				method,
				path,
				...(body === undefined ? [] : ["--input", "-"]),
			],
			body === undefined ? undefined : JSON.stringify(body),
		);
		return (out.trim() ? JSON.parse(out) : null) as T;
	}

	/** `repos/{owner}/{name}` + suffix */
	r(suffix: string) {
		return `repos/${this.repo}${suffix}`;
	}
}

export async function run(args: string[], input?: string): Promise<string> {
	const proc = Bun.spawn(["gh", ...args], {
		stdin: input === undefined ? "ignore" : new Blob([input]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) {
		throw new Error(
			`gh ${args.slice(0, 3).join(" ")} failed (${code}): ${err.trim() || out.trim()}`,
		);
	}
	return out;
}
