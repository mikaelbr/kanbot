import type { Checks, Comment, Issue, PR } from "../daemon/types.ts";
import type { Gh } from "./gh.ts";

const COMMENT = "id databaseId author { login } body createdAt";

const ISSUE_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
	repository(owner: $owner, name: $name) {
		issue(number: $number) {
			id number url title body state
			labels(first: 50) { nodes { name } }
			comments(last: 100) { nodes { ${COMMENT} } }
			closedByPullRequestsReferences(first: 10, includeClosedPrs: true) {
				nodes {
					id number url title body state headRefName headRefOid
					labels(first: 30) { nodes { name } }
					comments(last: 100) { nodes { ${COMMENT} } }
					reviews(last: 50) { nodes { ${COMMENT} } }
					reviewThreads(last: 100) {
						nodes {
							id isResolved path line
							comments(last: 30) { nodes { ${COMMENT} } }
						}
					}
					commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
				}
			}
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
		prs: i.closedByPullRequestsReferences.nodes.map(
			// biome-ignore lint/suspicious/noExplicitAny: raw GraphQL shape
			(p: any): PR => ({
				id: p.id,
				number: p.number,
				url: p.url,
				title: p.title,
				body: p.body,
				state: p.state,
				headRefName: p.headRefName,
				headSha: p.headRefOid,
				labels: names(p.labels),
				comments: p.comments.nodes.map(comment),
				reviews: p.reviews.nodes
					.map(comment)
					.filter((r: Comment) => r.body.trim()),
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
			}),
		),
	};
}

// ---- writes ---------------------------------------------------------------

export function postComment(gh: Gh, number: number, body: string) {
	return gh.restWrite(
		`comment on #${number}`,
		"POST",
		gh.r(`/issues/${number}/comments`),
		{ body },
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
		{ t: threadId, b: body },
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
