import { z } from "zod";

/*
 * Output contracts for column agents. Both CLIs enforce these natively
 * (claude --json-schema, codex --output-schema). Codex uses strict schemas, so
 * every field is required; use null or empty arrays for "nothing".
 */

export const PlanResult = z.strictObject({
	plan: z
		.string()
		.describe("Full markdown plan. Replaces the previous plan block entirely."),
	summary: z
		.string()
		.describe("One or two sentences on what changed, addressed to the human."),
	replies: z
		.array(
			z.strictObject({
				commentId: z.string().describe("id of the human comment answered"),
				body: z.string(),
			}),
		)
		.describe("One reply per human comment given as input."),
	newIssues: z
		.array(
			z.strictObject({
				title: z.string(),
				body: z.string(),
				subIssue: z
					.boolean()
					.describe("true when it is split out of this issue"),
				column: z.enum(["ideas", "planning"]),
			}),
		)
		.describe("Issues to create, e.g. when the human asks to split work."),
	labels: z
		.array(z.string())
		.describe("Labels the issue should have, e.g. type:frontend or technical."),
	questions: z
		.array(z.string())
		.describe("Open questions only the human can answer."),
});
export type PlanResult = z.infer<typeof PlanResult>;

export const ImplementResult = z.strictObject({
	status: z.enum(["done", "blocked"]),
	prTitle: z.string(),
	prBody: z
		.string()
		.describe(
			"Markdown PR description: what, why, how to test. No 'Closes' line.",
		),
	testsRun: z.array(z.string()).describe("Commands run and their outcome."),
	screenshots: z
		.array(z.string())
		.describe("Repo-relative paths of screenshots committed for review."),
	risks: z.array(z.string()),
	blockedReason: z.string().nullable(),
});
export type ImplementResult = z.infer<typeof ImplementResult>;

export const Finding = z.strictObject({
	id: z.string().describe("Short stable id like F1"),
	severity: z.enum(["blocker", "major", "minor", "nit"]),
	path: z.string().nullable(),
	line: z.number().int().nullable(),
	body: z.string(),
});
export type Finding = z.infer<typeof Finding>;

export const ReviewResult = z.strictObject({
	verdict: z.enum(["approve", "changes"]),
	summary: z.string(),
	findings: z.array(Finding),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

export const FixResult = z.strictObject({
	addressed: z.array(
		z.strictObject({
			ref: z.string().describe("Finding id or comment/thread id handled"),
			reply: z.string().describe("What was done, or why not"),
			resolved: z.boolean(),
		}),
	),
	summary: z.string(),
});
export type FixResult = z.infer<typeof FixResult>;

export const RESULT_SCHEMAS = {
	"plan-result": PlanResult,
	"implement-result": ImplementResult,
	"review-result": ReviewResult,
	"fix-result": FixResult,
} as const;
export type ResultSchemaName = keyof typeof RESULT_SCHEMAS;

export function jsonSchema(name: ResultSchemaName) {
	return z.toJSONSchema(RESULT_SCHEMAS[name], { target: "draft-7" });
}
