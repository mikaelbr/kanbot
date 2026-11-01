import type { ColumnKey } from "../config.ts";

export type Comment = {
	id: string;
	databaseId: number;
	author: string;
	body: string;
	createdAt: string;
};

export type ReviewThread = {
	id: string;
	isResolved: boolean;
	path: string | null;
	line: number | null;
	comments: Comment[];
};

export type Checks =
	| "SUCCESS"
	| "FAILURE"
	| "ERROR"
	| "PENDING"
	| "EXPECTED"
	| null;

export type ReviewState =
	| "APPROVED"
	| "CHANGES_REQUESTED"
	| "COMMENTED"
	| "DISMISSED"
	| "PENDING";

/** A reviewer's latest review on a PR, body or not. */
export type ReviewVerdict = {
	author: string;
	state: ReviewState;
	/** Head commit the review was made on. */
	commit: string | null;
};

export type PR = {
	id: string;
	number: number;
	url: string;
	title: string;
	body: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	headRefName: string;
	headSha: string;
	createdAt: string;
	labels: string[];
	comments: Comment[];
	/** Submitted reviews that have a body. */
	reviews: Comment[];
	/** Latest review per reviewer, for approvals. */
	verdicts: ReviewVerdict[];
	threads: ReviewThread[];
	checks: Checks;
	/** UNKNOWN while GitHub is still computing it. */
	mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
};

export type Issue = {
	id: string;
	number: number;
	url: string;
	title: string;
	body: string;
	state: "OPEN" | "CLOSED";
	labels: string[];
	comments: Comment[];
	prs: PR[];
	/** A PR labeled `kanbot-review`, reviewed without a card. Fields mirror the PR. */
	prOnly?: boolean;
};

export type Item = {
	itemId: string;
	column: ColumnKey | null;
	/** Index in board order; lower is higher priority. */
	position: number;
	issue: Issue;
};

export type Snapshot = {
	items: Item[];
	/** Logins whose comments agents act on (collaborators with write access). */
	trusted: ReadonlySet<string>;
};
