import { existsSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { z } from "zod";

export const COLUMN_KEYS = [
	"ideas",
	"planning",
	"ready",
	"inProgress",
	"review",
	"done",
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export const JOB_KINDS = ["fix", "review", "plan", "implement"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const ConfigSchema = z.object({
	provider: z.enum(["claude", "codex"]).default("claude"),
	repo: z.string().regex(/^[^/]+\/[^/]+$/, "expected owner/name"),
	baseBranch: z.string().default("main"),
	project: z
		.object({ owner: z.string(), number: z.number().int() })
		.nullable()
		.default(null),
	columns: z
		.object({
			ideas: z.string().default("Ideas"),
			planning: z.string().default("Planning"),
			ready: z.string().default("Ready"),
			inProgress: z.string().default("In Progress"),
			review: z.string().default("Review"),
			done: z.string().default("Done"),
		})
		.prefault({}),
	/** Max concurrent agent workers. Each exploratory variant is one worker. */
	concurrency: z.number().int().min(1).default(3),
	pollSeconds: z.number().int().min(10).default(60),
	/** Order in which waiting jobs get free slots. */
	priority: z.array(z.enum(JOB_KINDS)).default([...JOB_KINDS]),
	/** Attempts per job before the issue is labeled needs-human. */
	maxAttempts: z.number().int().min(1).default(2),
	timeoutMinutes: z
		.object({
			plan: z.number().default(20),
			implement: z.number().default(90),
			review: z.number().default(30),
			fix: z.number().default(45),
		})
		.prefault({}),
	/** Which column agent implements an issue, chosen by its type:* label. */
	implementers: z.record(z.string(), z.string()).default({
		frontend: "implementer-frontend",
		backend: "implementer-backend",
		docs: "implementer-docs",
		infra: "implementer-technical",
		default: "implementer-backend",
	}),
	codex: z
		.object({
			/** Let codex workers reach the network (package installs). */
			networkAccess: z.boolean().default(false),
		})
		.prefault({}),
	notify: z
		.object({
			desktop: z.boolean().default(true),
			/** POSTs {title, message, url} as JSON, e.g. an ntfy.sh topic URL. */
			webhook: z.string().url().nullable().default(null),
		})
		.prefault({}),
});
export type Config = z.infer<typeof ConfigSchema>;

export const LABELS = {
	technical: "technical",
	working: "autogh:working",
	agentReviewed: "agent-reviewed",
	needsHuman: "needs-human",
	explorePrefix: "explore:",
	typePrefix: "type:",
	variantPrefix: "variant:",
} as const;

export function configPath(root: string) {
	return join(root, ".autogh", "config.yml");
}

export async function loadConfig(root: string): Promise<Config> {
	const path = configPath(root);
	if (!existsSync(path)) {
		throw new Error(`No ${path}. Run \`autogh init\` first.`);
	}
	return ConfigSchema.parse(parse(await Bun.file(path).text()) ?? {});
}

export async function saveConfig(root: string, patch: Partial<Config>) {
	const path = configPath(root);
	const current = existsSync(path)
		? (parse(await Bun.file(path).text()) ?? {})
		: {};
	await Bun.write(path, stringify({ ...current, ...patch }));
}
