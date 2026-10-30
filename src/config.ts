import { existsSync } from "node:fs";
import { join } from "node:path";
import { parse, parseDocument } from "yaml";
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
	provider: z
		.enum(["claude", "codex"])
		.default("claude")
		.describe("Agent CLI that runs workers."),
	repo: z
		.string()
		.regex(/^[^/]+\/[^/]+$/, "expected owner/name")
		.describe("GitHub repo as owner/name."),
	baseBranch: z.string().default("main").describe("Branch agents work from."),
	project: z
		.object({ owner: z.string(), number: z.number().int() })
		.nullable()
		.default(null)
		.describe("GitHub Project board. Set by `autogh board create`."),
	columns: z
		.object({
			ideas: z.string().default("Ideas"),
			planning: z.string().default("Planning"),
			ready: z.string().default("Ready"),
			inProgress: z.string().default("In Progress"),
			review: z.string().default("Review"),
			done: z.string().default("Done"),
		})
		.prefault({})
		.describe("Names of the board's Status options."),
	concurrency: z
		.number()
		.int()
		.min(1)
		.default(3)
		.describe(
			"Max concurrent agent workers. Each exploratory variant is one worker.",
		),
	pollSeconds: z
		.number()
		.int()
		.min(10)
		.default(60)
		.describe("Seconds between board polls."),
	priority: z
		.array(z.enum(JOB_KINDS))
		.default([...JOB_KINDS])
		.describe("Order in which waiting jobs get free slots."),
	maxAttempts: z
		.number()
		.int()
		.min(1)
		.default(2)
		.describe("Attempts per job before the issue is labeled needs-human."),
	timeoutMinutes: z
		.object({
			plan: z.number().default(20),
			implement: z.number().default(90),
			review: z.number().default(30),
			fix: z.number().default(45),
		})
		.prefault({})
		.describe("Per-job timeout in minutes."),
	implementers: z
		.record(z.string(), z.string())
		.default({
			frontend: "implementer-frontend",
			backend: "implementer-backend",
			docs: "implementer-docs",
			infra: "implementer-technical",
			default: "implementer-backend",
		})
		.describe(
			"Maps a type:<key> label to an agent. `default` is the fallback.",
		),
	codex: z
		.object({
			networkAccess: z
				.boolean()
				.default(false)
				.describe("Let codex workers reach the network (package installs)."),
		})
		.prefault({}),
	notify: z
		.object({
			desktop: z
				.boolean()
				.default(true)
				.describe("Show desktop notifications."),
			webhook: z
				.string()
				.url()
				.nullable()
				.default(null)
				.describe(
					"POSTs {title, message, url} as JSON, e.g. an ntfy.sh topic URL.",
				),
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

export function configSchemaPath(root: string) {
	return join(root, ".autogh", "config.schema.json");
}

/** Points editors (yaml-language-server) at the schema next to the config. */
const SCHEMA_HEADER = "# yaml-language-server: $schema=./config.schema.json\n";

/** JSON Schema for config.yml. Fields with defaults are optional. */
export function configJsonSchema() {
	return {
		...z.toJSONSchema(ConfigSchema, { io: "input", target: "draft-7" }),
		title: "autogh config",
	};
}

/** Ignores formatting, so a formatter touching the file doesn't make it stale. */
export function sameJson(a: string, b: string) {
	try {
		return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));
	} catch {
		return false;
	}
}

export function renderConfigSchema(): string {
	return `${JSON.stringify(configJsonSchema(), null, "\t")}\n`;
}

/** Writes .autogh/config.schema.json. Returns true if it was missing or stale. */
export async function writeConfigSchema(
	root: string,
	opts: { check?: boolean } = {},
): Promise<boolean> {
	const path = configSchemaPath(root);
	const next = renderConfigSchema();
	if (existsSync(path) && sameJson(await Bun.file(path).text(), next))
		return false;
	if (!opts.check) await Bun.write(path, next);
	return true;
}

export async function loadConfig(root: string): Promise<Config> {
	const path = configPath(root);
	if (!existsSync(path)) {
		throw new Error(`No ${path}. Run \`autogh init\` first.`);
	}
	return ConfigSchema.parse(parse(await Bun.file(path).text()) ?? {});
}

/** Sets top-level keys, keeping the user's comments and formatting. */
export async function saveConfig(root: string, patch: Partial<Config>) {
	const path = configPath(root);
	const text = existsSync(path) ? await Bun.file(path).text() : SCHEMA_HEADER;
	const doc = parseDocument(text);
	for (const [key, value] of Object.entries(patch)) doc.set(key, value);
	await Bun.write(path, String(doc));
	await writeConfigSchema(root);
}
