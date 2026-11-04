import { existsSync } from "node:fs";
import { join } from "node:path";
import { parse, parseDocument } from "yaml";
import { z } from "zod";
import { UserError } from "./errors.ts";

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

export const RESERVED_CAPABILITIES = ["verify", "review", "preview"] as const;

const CapabilityObject = z.object({
	use: z
		.string()
		.min(1)
		.describe(
			"Skill in .agents/skills or agent in .kanbot/agents that does the work.",
		),
	when: z
		.string()
		.optional()
		.describe("When it applies, e.g. `Changes to UI users see`."),
	required: z
		.boolean()
		.default(false)
		.describe("A miss when it applies blocks acceptance review."),
});

/** `verify: verify-ui` is short for `verify: { use: verify-ui }`. */
export const Capability = z.union([
	z
		.string()
		.min(1)
		.describe("Skill or agent name, short for `{ use: <name> }`.")
		.transform((use) => CapabilityObject.parse({ use })),
	CapabilityObject,
]);
export type Capability = z.output<typeof Capability>;

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
		.describe("GitHub Project board. Set by `kanbot board create`."),
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
	wip: z
		.object({
			awaitingHuman: z
				.number()
				.int()
				.min(1)
				.nullable()
				.default(null)
				.describe(
					"When this many items wait on you (`kanbot status`), no new Ready card starts. Started work runs on. null: no limit.",
				),
		})
		.prefault({})
		.describe("Work-in-progress limits."),
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
		.optional()
		.describe(
			"Deprecated: implement always uses `implementer`. While set, maps a type:<key> label to an agent, with `default` as the fallback. Use capabilities instead.",
		),
	capabilities: z
		.record(z.string().regex(/^[a-z][a-z0-9-]*$/), Capability)
		.default({})
		.describe(
			"Needs mapped to the repo's own skills or agents. Reserved: verify (prove acceptance criteria), review (technical review), preview (something a human can try). Other names are yours.",
		),
	review: z
		.object({
			copilot: z
				.boolean()
				.default(false)
				.describe(
					"Wait for GitHub Copilot's code review and have the fixer address its comments. Needs a paid Copilot plan; each review uses credits.",
				),
			copilotOnPush: z
				.boolean()
				.default(false)
				.describe(
					"Have Copilot review again after every push. One review per push.",
				),
			copilotWaitMinutes: z
				.number()
				.int()
				.min(1)
				.default(15)
				.describe(
					"Minutes to wait for Copilot's review before going on without it.",
				),
		})
		.prefault({}),
	identity: z
		.object({
			mode: z
				.enum(["user", "app"])
				.default("user")
				.describe(
					"Who kanbot talks as. `user`: your account. `app`: a kanbot GitHub App, so its comments and PRs show as a bot. Commits are always yours.",
				),
			app: z
				.object({
					id: z.number().int().describe("GitHub App ID."),
					slug: z.string().describe("App slug, as in github.com/apps/<slug>."),
				})
				.nullable()
				.default(null)
				.describe(
					"Set by `kanbot app create`. The private key lives in ~/.kanbot/apps/<id>.pem.",
				),
		})
		.prefault({}),
	merge: z
		.object({
			onApproval: z
				.boolean()
				.default(false)
				.describe(
					"Merge a kanbot PR when a collaborator approves it, checks pass and agent review is done. Merges as you. Needs identity.mode app to approve your own kanbot PRs.",
				),
			method: z
				.enum(["squash", "merge", "rebase"])
				.default("squash")
				.describe("Merge method used for approved PRs."),
		})
		.prefault({}),
	codex: z
		.object({
			networkAccess: z
				.boolean()
				.default(false)
				.describe(
					"Ignored: codex workers that run commands have no sandbox, so they have network.",
				),
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
	working: "kanbot:working",
	agentReviewed: "agent-reviewed",
	needsHuman: "needs-human",
	review: "kanbot-review",
	explorePrefix: "explore:",
	typePrefix: "type:",
	variantPrefix: "variant:",
} as const;

export function configPath(root: string) {
	return join(root, ".kanbot", "config.yml");
}

export function configSchemaPath(root: string) {
	return join(root, ".kanbot", "config.schema.json");
}

/** Points editors (yaml-language-server) at the schema next to the config. */
const SCHEMA_HEADER = "# yaml-language-server: $schema=./config.schema.json\n";

/** JSON Schema for config.yml. Fields with defaults are optional. */
export function configJsonSchema() {
	return {
		...z.toJSONSchema(ConfigSchema, { io: "input", target: "draft-7" }),
		title: "kanbot config",
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

/** Writes .kanbot/config.schema.json. Returns true if it was missing or stale. */
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
		throw new UserError("kanbot is not set up in this repo.", {
			why: "No .kanbot/config.yml in this directory.",
			fix: "kanbot init",
			docs: "getting-started#set-up-a-repository",
		});
	}
	let raw: unknown;
	try {
		raw = parse(await Bun.file(path).text());
	} catch (e) {
		throw new UserError(
			".kanbot/config.yml is not valid YAML.",
			{
				why: (e as Error).message.trim(),
				fix: "Fix the syntax at the line shown above.",
				docs: "configuration#config-file",
			},
			{ cause: e },
		);
	}
	const config = ConfigSchema.safeParse(raw ?? {});
	if (!config.success) {
		throw new UserError(".kanbot/config.yml has invalid values.", {
			why: z.prettifyError(config.error),
			fix: "Fix the fields above. .kanbot/config.schema.json lists allowed values.",
			docs: "configuration#config-file",
		});
	}
	return config.data;
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
