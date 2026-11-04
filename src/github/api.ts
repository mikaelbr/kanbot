import type { Checks, Comment, Issue, IssueRef, PR } from "../daemon/types.ts";
import type { Activity } from "../report.ts";
import type { Gh } from "./gh.ts";

const COMMENT = "id databaseId author { login } body createdAt";

// Limits set GraphQL cost: nested connections multiply (PRs × threads ×
// comments). Raising them can exhaust the 5000 points/hour budget.
const PR_FIELDS = `
	id number url title body state headRefName headRefOid mergeable createdAt
	labels(first: 30) { nodes { name } }
	comments(last: 50) { nodes { ${COMMENT} } }
	reviews(last: 30) { nodes { ${COMMENT} } }
	latestReviews(last: 20) { nodes { author { login } state commit { oid } } }
	reviewThreads(last: 50) {
		nodes {
			id isResolved path line
			comments(last: 10) { nodes { ${COMMENT} } }
		}
	}
	commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }`;

const ISSUE_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
	repository(owner: $owner, name: $name) {
		issue(number: $number) {
			id number url title body state
			labels(first: 50) { nodes { name } }
			comments(last: 100) { nodes { ${COMMENT} } }
			blockedBy(first: 20) { nodes { number state repository { nameWithOwner } } }
			closedByPullRequestsReferences(first: 5, includeClosedPrs: true) {
				nodes { ${PR_FIELDS} }
			}
		}
	}
}`;

const LABELED_PRS_QUERY = `
query($owner: String!, $name: String!, $label: String!) {
	repository(owner: $owner, name: $name) {
		pullRequests(labels: [$label], states: OPEN, first: 20) {
			nodes { isCrossRepository ${PR_FIELDS} }
		}
	}
}`;

type RawComment = Omit<Comment, "author"> & {
	author: { login: string } | null;
};
type Nodes<T> = { nodes: T[] };

const comment = (c: RawComment): Comment => ({
	...c,
	author: c.author?.login ?? "ghost",
});
const names = (l: Nodes<{ name: string }>) => l.nodes.map((n) => n.name);

export async function fetchIssue(gh: Gh, number: number): Promise<Issue> {
	// biome-ignore lint/suspicious/noExplicitAny: raw GraphQL shape, mapped below
	const data = await gh.query<any>(ISSUE_QUERY, {
		owner: gh.owner,
		name: gh.name,
		number,
	});
	const i = data.repository.issue;
	return {
		id: i.id,
		number: i.number,
		url: i.url,
		title: i.title,
		body: i.body,
		state: i.state,
		labels: names(i.labels),
		comments: i.comments.nodes.map(comment),
		prs: i.closedByPullRequestsReferences.nodes.map(mapPR),
		// biome-ignore lint/suspicious/noExplicitAny: raw GraphQL shape
		blockedBy: i.blockedBy.nodes.map((b: any): IssueRef => {
			const repo = b.repository.nameWithOwner;
			return {
				number: b.number,
				repo: repo === gh.repo ? null : repo,
				state: b.state,
			};
		}),
	};
}

/**
 * Open PRs with `label`, for review without a board card. Fork PRs are left
 * out: their branch isn't on origin, so fixes couldn't be pushed.
 */
export async function fetchLabeledPRs(gh: Gh, label: string): Promise<PR[]> {
	// biome-ignore lint/suspicious/noExplicitAny: raw GraphQL shape, mapped below
	const data = await gh.query<any>(LABELED_PRS_QUERY, {
		owner: gh.owner,
		name: gh.name,
		label,
	});
	return data.repository.pullRequests.nodes
		.filter((p: { isCrossRepository: boolean }) => !p.isCrossRepository)
		.map(mapPR);
}

// biome-ignore lint/suspicious/noExplicitAny: raw GraphQL shape
function mapPR(p: any): PR {
	return {
		id: p.id,
		number: p.number,
		url: p.url,
		title: p.title,
		body: p.body,
		state: p.state,
		headRefName: p.headRefName,
		headSha: p.headRefOid,
		createdAt: p.createdAt,
		labels: names(p.labels),
		comments: p.comments.nodes.map(comment),
		reviews: p.reviews.nodes.map(comment).filter((r: Comment) => r.body.trim()),
		// biome-ignore lint/suspicious/noExplicitAny: raw GraphQL shape
		verdicts: p.latestReviews.nodes.map((r: any) => ({
			author: r.author?.login ?? "ghost",
			state: r.state,
			commit: r.commit?.oid ?? null,
		})),
		// biome-ignore lint/suspicious/noExplicitAny: raw GraphQL shape
		threads: p.reviewThreads.nodes.map((t: any) => ({
			id: t.id,
			isResolved: t.isResolved,
			path: t.path,
			line: t.line,
			comments: t.comments.nodes.map(comment),
		})),
		checks: (p.commits.nodes[0]?.commit.statusCheckRollup?.state ??
			null) as Checks,
		mergeable: p.mergeable,
	};
}

/** An issue or PR as GitHub's REST issue list returns it. */
export type Updated = { number: number; updatedAt: string; pr: boolean };

/**
 * Issues and PRs updated since `since`, oldest first. REST, so it uses the
 * core rate limit, not the GraphQL budget the snapshot spends.
 */
export async function updatedSince(gh: Gh, since: Date): Promise<Updated[]> {
	type Raw = { number: number; updated_at: string; pull_request?: unknown };
	const out: Updated[] = [];
	for (let page = 1; ; page++) {
		const rows = await gh.rest<Raw[]>(
			gh.r(
				`/issues?state=all&sort=updated&direction=asc&per_page=100&page=${page}&since=${since.toISOString()}`,
			),
		);
		for (const r of rows)
			out.push({
				number: r.number,
				updatedAt: r.updated_at,
				pr: !!r.pull_request,
			});
		if (rows.length < 100) return out;
	}
}

/** Issue numbers each PR closes, in one query. */
export async function closingIssues(
	gh: Gh,
	prs: number[],
): Promise<Map<number, number[]>> {
	if (!prs.length) return new Map();
	const fields = prs
		.map(
			(n) =>
				`p${n}: pullRequest(number: ${n}) { closingIssuesReferences(first: 10) { nodes { number } } }`,
		)
		.join("\n");
	// biome-ignore lint/suspicious/noExplicitAny: raw GraphQL shape
	const data = await gh.query<any>(
		`query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
		{ owner: gh.owner, name: gh.name },
	);
	return new Map(
		prs.map((n) => [
			n,
			(data.repository[`p${n}`]?.closingIssuesReferences.nodes ?? []).map(
				(i: { number: number }) => i.number,
			),
		]),
	);
}

// ---- writes ---------------------------------------------------------------

/**
 * Visible sign on kanbot's comments when it posts as the user. In app mode
 * GitHub's bot badge already says so.
 */
export const SIGNATURE = "<sub>🤖 kanbot</sub>";

export const signed = (gh: Gh, body: string) =>
	gh.isBot ? body : `${SIGNATURE}\n\n${body}`;

export function postComment(gh: Gh, number: number, body: string) {
	return gh.restWrite(
		`comment on #${number}`,
		"POST",
		gh.r(`/issues/${number}/comments`),
		{ body: signed(gh, body) },
	);
}

export function updateIssueBody(gh: Gh, number: number, body: string) {
	return gh.restWrite(
		`update body of #${number}`,
		"PATCH",
		gh.r(`/issues/${number}`),
		{ body },
	);
}

export function addLabels(gh: Gh, number: number, labels: string[]) {
	if (!labels.length) return Promise.resolve(null);
	return gh.restWrite(
		`label #${number} ${labels.join(",")}`,
		"POST",
		gh.r(`/issues/${number}/labels`),
		{
			labels,
		},
	);
}

export async function removeLabel(gh: Gh, number: number, label: string) {
	try {
		await gh.restWrite(
			`unlabel #${number} ${label}`,
			"DELETE",
			gh.r(`/issues/${number}/labels/${encodeURIComponent(label)}`),
		);
	} catch (e) {
		if (!String(e).includes("404")) throw e;
	}
}

export function react(
	gh: Gh,
	subjectId: string,
	content: "EYES" | "THUMBS_UP" | "ROCKET",
) {
	return gh.mutate(
		`react ${content}`,
		`mutation($s: ID!, $c: ReactionContent!) { addReaction(input: { subjectId: $s, content: $c }) { reaction { content } } }`,
		{ s: subjectId, c: content },
	);
}

export async function createIssue(gh: Gh, title: string, body: string) {
	return gh.restWrite<{ number: number; node_id: string }>(
		`create issue "${title}"`,
		"POST",
		gh.r("/issues"),
		{ title, body },
	);
}

export function addSubIssue(gh: Gh, parentId: string, childId: string) {
	return gh.mutate(
		"add sub-issue",
		`mutation($p: ID!, $c: ID!) { addSubIssue(input: { issueId: $p, subIssueId: $c }) { issue { id } } }`,
		{ p: parentId, c: childId },
	);
}

export function addBlockedBy(gh: Gh, issueId: string, blockerId: string) {
	return gh.mutate(
		"add blocked-by",
		`mutation($i: ID!, $b: ID!) { addBlockedBy(input: { issueId: $i, blockingIssueId: $b }) { issue { id } } }`,
		{ i: issueId, b: blockerId },
	);
}

export function createPR(
	gh: Gh,
	pr: {
		title: string;
		body: string;
		head: string;
		base: string;
		draft?: boolean;
	},
) {
	return gh.restWrite<{ number: number; html_url: string }>(
		`open PR ${pr.head} → ${pr.base}`,
		"POST",
		gh.r("/pulls"),
		pr,
	);
}

export function updatePRBody(gh: Gh, number: number, body: string) {
	return gh.restWrite(
		`update body of PR #${number}`,
		"PATCH",
		gh.r(`/pulls/${number}`),
		{ body },
	);
}

/** Merge only if the head is still `sha`, so later pushes aren't merged unseen. */
export function mergePR(
	gh: Gh,
	number: number,
	sha: string,
	method: "squash" | "merge" | "rebase",
) {
	return gh.restWrite(
		`merge PR #${number} (${method})`,
		"PUT",
		gh.r(`/pulls/${number}/merge`),
		{ sha, merge_method: method },
	);
}

export function requestReview(gh: Gh, number: number, logins: string[]) {
	return gh.restWrite(
		`request review on #${number} from ${logins.join(",")}`,
		"POST",
		gh.r(`/pulls/${number}/requested_reviewers`),
		{ reviewers: logins },
	);
}

/** Login of the account `gh` is signed in as. */
export async function viewer(gh: Gh) {
	return (await gh.rest<{ login: string }>("user")).login;
}

export function closePR(gh: Gh, number: number) {
	return gh.restWrite(
		`close PR #${number}`,
		"PATCH",
		gh.r(`/pulls/${number}`),
		{ state: "closed" },
	);
}

export function replyToThread(gh: Gh, threadId: string, body: string) {
	return gh.mutate(
		"reply to review thread",
		`mutation($t: ID!, $b: String!) {
			addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $t, body: $b }) { comment { id } }
		}`,
		{ t: threadId, b: signed(gh, body) },
	);
}

export function resolveThread(gh: Gh, threadId: string) {
	return gh.mutate(
		"resolve review thread",
		`mutation($t: ID!) { resolveReviewThread(input: { threadId: $t }) { thread { id } } }`,
		{ t: threadId },
	);
}

export async function ensureLabel(
	gh: Gh,
	name: string,
	color: string,
	description: string,
) {
	try {
		await gh.restWrite(`create label ${name}`, "POST", gh.r("/labels"), {
			name,
			color,
			description,
		});
	} catch (e) {
		if (!String(e).includes("already_exists")) throw e;
	}
}

export async function failedCheckLogs(gh: Gh, sha: string): Promise<string> {
	type Runs = {
		check_runs: {
			name: string;
			conclusion: string | null;
			output: {
				title: string | null;
				summary: string | null;
				text: string | null;
			};
		}[];
	};
	const runs = await gh.rest<Runs>(
		gh.r(`/commits/${sha}/check-runs?per_page=50`),
	);
	return runs.check_runs
		.filter((r) => r.conclusion === "failure" || r.conclusion === "timed_out")
		.map(
			(r) =>
				`### ${r.name} (${r.conclusion})\n${[r.output.title, r.output.summary, r.output.text].filter(Boolean).join("\n").slice(0, 6000)}`,
		)
		.join("\n\n");
}

// ---- Copilot code review ------------------------------------------------------

const COPILOT_RULESET = "kanbot: Copilot review";

/** Create or update the branch ruleset that requests Copilot review on PRs. */
export async function ensureCopilotRuleset(gh: Gh, onPush: boolean) {
	const body = {
		name: COPILOT_RULESET,
		target: "branch",
		enforcement: "active",
		conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
		rules: [
			{
				type: "copilot_code_review",
				parameters: {
					review_on_push: onPush,
					review_draft_pull_requests: false,
				},
			},
		],
	};
	const sets = await gh.rest<{ id: number; name: string }[]>(gh.r("/rulesets"));
	const existing = sets.find((s) => s.name === COPILOT_RULESET);
	return existing
		? gh.restWrite(
				"update Copilot review ruleset",
				"PUT",
				gh.r(`/rulesets/${existing.id}`),
				body,
			)
		: gh.restWrite(
				"create Copilot review ruleset",
				"POST",
				gh.r("/rulesets"),
				body,
			);
}

/** The active Copilot review rule on `branch`, if any. */
export async function copilotReviewRule(gh: Gh, branch: string) {
	type Rule = { type: string; parameters?: { review_on_push?: boolean } };
	const rules = await gh.rest<Rule[]>(
		gh.r(`/rules/branches/${encodeURIComponent(branch)}`),
	);
	return rules.find((r) => r.type === "copilot_code_review") ?? null;
}

const ACTIVITY_QUERY = `
query($q: String!, $after: String) {
	search(query: $q, type: ISSUE, first: 50, after: $after) {
		nodes {
			__typename
			... on PullRequest {
				number title url headRefName createdAt mergedAt
				comments(last: 100) { nodes { body createdAt } }
			}
			... on Issue {
				number title url createdAt
				comments(last: 100) { nodes { body createdAt } }
			}
		}
		pageInfo { hasNextPage endCursor }
	}
}`;

/** Issues and PRs updated since `since`, with comments, for `kanbot report`. */
export async function fetchActivity(gh: Gh, since: Date): Promise<Activity[]> {
	const q = `repo:${gh.repo} updated:>=${since.toISOString().slice(0, 10)}`;
	const out: Activity[] = [];
	let after: string | null = null;
	do {
		// biome-ignore lint/suspicious/noExplicitAny: raw GraphQL shape, mapped below
		const data: any = await gh.query(ACTIVITY_QUERY, { q, after });
		for (const n of data.search.nodes) {
			if (n.__typename !== "PullRequest" && n.__typename !== "Issue") continue;
			out.push({
				kind: n.__typename === "PullRequest" ? "pr" : "issue",
				number: n.number,
				title: n.title,
				url: n.url,
				headRefName: n.headRefName,
				createdAt: n.createdAt,
				mergedAt: n.mergedAt,
				comments: n.comments.nodes,
			});
		}
		const page = data.search.pageInfo;
		after = page.hasNextPage ? page.endCursor : null;
	} while (after);
	return out;
}
