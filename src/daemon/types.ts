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

export type PR = {
	id: string;
	number: number;
	url: string;
	title: string;
	body: string;
	state: "OPEN" | "CLOSED" | "MERGED";
	headRefName: string;
	headSha: string;
	labels: string[];
	comments: Comment[];
	/** Submitted reviews that have a body. */
	reviews: Comment[];
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
