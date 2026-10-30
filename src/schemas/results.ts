import { z } from "zod";

/*
 * Output contracts for column agents. Both CLIs enforce these natively
 * (claude --json-schema, codex --output-schema). Codex uses strict schemas, so
 * every field is required; use null or empty arrays for "nothing".
 */

export const PlanResult = z.strictObject({
	plan: z
		.string()
		.describe(
			"Full markdown plan per plan-template; replaces the previous plan. Aim for under 30 lines.",
		),
	summary: z.string().describe("One sentence to the human on what changed."),
	replies: z
		.array(
			z.strictObject({
				commentId: z.string().describe("id of the human comment answered"),
				body: z.string().describe("One or two sentences."),
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
		.describe(
			"Only questions blocking approval, one line each, with the default you assume.",
		),
});
export type PlanResult = z.infer<typeof PlanResult>;

export const ImplementResult = z.strictObject({
	status: z.enum(["done", "blocked"]),
	prTitle: z.string().describe("Conventional commit, under 72 characters."),
	prBody: z
		.string()
		.describe(
			"Short markdown PR description per pr-description, under ~20 lines. No 'Closes' line, risks or test results.",
		),
	testsRun: z
		.array(z.string())
		.describe("One line each: command and result, e.g. `bun test`: 5 pass."),
	screenshots: z
		.array(z.string())
		.describe("Repo-relative paths of screenshots committed for review."),
	risks: z
		.array(z.string())
		.describe("Real risks only, one line each. Empty when none."),
	blockedReason: z.string().nullable(),
});
export type ImplementResult = z.infer<typeof ImplementResult>;

export const Finding = z.strictObject({
	id: z.string().describe("Short stable id like F1"),
	severity: z.enum(["blocker", "major", "minor", "nit"]),
	path: z.string().nullable(),
	line: z.number().int().nullable(),
	body: z
		.string()
		.describe("One to three sentences: the problem, why it matters, the fix."),
});
export type Finding = z.infer<typeof Finding>;

export const ReviewResult = z.strictObject({
	verdict: z.enum(["approve", "changes"]),
	summary: z.string().describe("One or two sentences."),
	findings: z.array(Finding),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

export const FixResult = z.strictObject({
	addressed: z.array(
		z.strictObject({
			ref: z.string().describe("Finding id or comment/thread id handled"),
			reply: z
				.string()
				.describe("One or two sentences: what changed, or why not."),
			resolved: z.boolean(),
		}),
	),
	summary: z.string().describe("One sentence."),
	prBody: z
		.string()
		.nullable()
		.describe(
			"Full updated PR description when your changes made the current one wrong (behaviour, copy, screenshots); null otherwise.",
		),
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
