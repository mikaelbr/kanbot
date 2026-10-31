import { COLUMN_KEYS, type ColumnKey, type Config } from "../config.ts";
import type { Gh } from "./gh.ts";

export type Board = {
	id: string;
	url: string;
	statusFieldId: string;
	/** column key → single-select option id */
	options: Partial<Record<ColumnKey, string>>;
	/** option id → column key */
	columnOf: Map<string, ColumnKey>;
};

const COLUMN_COLORS: Record<ColumnKey, string> = {
	ideas: "GRAY",
	planning: "PURPLE",
	ready: "BLUE",
	inProgress: "YELLOW",
	review: "ORANGE",
	done: "GREEN",
};

const COLUMN_DESCRIPTIONS: Record<ColumnKey, string> = {
	ideas: "Raw ideas and notes. Agents leave these alone.",
	planning:
		"Agent writes and refines the plan; comment to steer. Drag to Ready to approve.",
	ready: "Approved. Picked from the top when a worker is free.",
	inProgress: "An agent is implementing this.",
	review: "PRs open. Agent review passes, then human testing and merge.",
	done: "Merged and closed.",
};

const PROJECT_FIELDS = `
	id url
	field(name: "Status") {
		... on ProjectV2SingleSelectField { id options { id name } }
	}`;

type RawProject = {
	id: string;
	url: string;
	field: { id: string; options: { id: string; name: string }[] } | null;
};

function toBoard(p: RawProject, config: Config): Board {
	if (!p.field) throw new Error("Project has no single-select Status field");
	const options: Board["options"] = {};
	const columnOf = new Map<string, ColumnKey>();
	for (const key of COLUMN_KEYS) {
		const opt = p.field.options.find(
			(o) => o.name.toLowerCase() === config.columns[key].toLowerCase(),
		);
		if (opt) {
			options[key] = opt.id;
			columnOf.set(opt.id, key);
		}
	}
	return { id: p.id, url: p.url, statusFieldId: p.field.id, options, columnOf };
}

export async function loadBoard(gh: Gh, config: Config): Promise<Board> {
	if (!config.project) {
		throw new Error("No project configured. Run `kanbot board create`.");
	}
	const data = await gh.query<{
		repositoryOwner: { projectV2: RawProject | null } | null;
	}>(
		`query($login: String!, $number: Int!) {
			repositoryOwner(login: $login) {
				... on ProjectV2Owner { projectV2(number: $number) { ${PROJECT_FIELDS} } }
			}
		}`,
		{ login: config.project.owner, number: config.project.number },
	);
	const p = data.repositoryOwner?.projectV2;
	if (!p) {
		throw new Error(
			`Project ${config.project.owner}#${config.project.number} not found (does gh have the "project" scope? run: gh auth refresh -s project)`,
		);
	}
	return toBoard(p, config);
}

export function missingColumns(board: Board): ColumnKey[] {
	return COLUMN_KEYS.filter((k) => !board.options[k]);
}

/** Create a project linked to the repo with the kanbot columns. */
export async function createBoard(gh: Gh, config: Config, title: string) {
	const repo = await gh.query<{
		repository: { id: string; owner: { id: string; login: string } };
	}>(
		`query($owner: String!, $name: String!) {
			repository(owner: $owner, name: $name) { id owner { id login } }
		}`,
		{ owner: gh.owner, name: gh.name },
	);
	const created = await gh.mutate<{
		createProjectV2: {
			projectV2: RawProject & {
				number: number;
				views: { nodes: { id: string }[] };
			};
		};
	}>(
		`create project "${title}"`,
		`mutation($ownerId: ID!, $repositoryId: ID!, $title: String!) {
			createProjectV2(input: { ownerId: $ownerId, repositoryId: $repositoryId, title: $title }) {
				projectV2 { number views(first: 1) { nodes { id } } ${PROJECT_FIELDS} }
			}
		}`,
		{
			ownerId: repo.repository.owner.id,
			repositoryId: repo.repository.id,
			title,
		},
	);
	if (!created) return null;
	const project = created.createProjectV2.projectV2;
	if (!project.field) throw new Error("New project has no Status field");
	await gh.mutate(
		"configure Status columns",
		`mutation($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
			updateProjectV2Field(input: { fieldId: $fieldId, singleSelectOptions: $options }) {
				projectV2Field { ... on ProjectV2SingleSelectField { id } }
			}
		}`,
		{
			fieldId: project.field.id,
			options: COLUMN_KEYS.map((k) => ({
				name: config.columns[k],
				color: COLUMN_COLORS[k],
				description: COLUMN_DESCRIPTIONS[k],
			})),
		},
	);
	// New projects open as a table; make the default view a board (grouped by Status).
	const view = project.views.nodes[0];
	if (view) {
		await gh.mutate(
			"make default view a board",
			`mutation($v: ID!) {
				updateProjectV2View(input: { viewId: $v, name: "Board", layout: BOARD_LAYOUT }) {
					projectV2View { id }
				}
			}`,
			{ v: view.id },
		);
	}
	return {
		owner: repo.repository.owner.login,
		number: project.number,
		url: project.url,
	};
}

export type RawItem = {
	id: string;
	status: { optionId: string } | null;
	content: {
		__typename: string;
		number?: number;
		state?: string;
		repository?: { nameWithOwner: string };
	} | null;
};

/** All board items for this repo's issues, in board order. */
export async function listItems(gh: Gh, board: Board) {
	const items: {
		itemId: string;
		column: ColumnKey | null;
		number: number;
		state: string;
	}[] = [];
	let after: string | null = null;
	do {
		const data: {
			node: {
				items: {
					nodes: RawItem[];
					pageInfo: { hasNextPage: boolean; endCursor: string };
				};
			};
		} = await gh.query(
			`query($id: ID!, $after: String) {
				node(id: $id) {
					... on ProjectV2 {
						items(first: 100, after: $after) {
							nodes {
								id
								status: fieldValueByName(name: "Status") {
									... on ProjectV2ItemFieldSingleSelectValue { optionId }
								}
								content {
									__typename
									... on Issue { number state repository { nameWithOwner } }
								}
							}
							pageInfo { hasNextPage endCursor }
						}
					}
				}
			}`,
			{ id: board.id, after },
		);
		for (const n of data.node.items.nodes) {
			if (n.content?.__typename !== "Issue") continue;
			if (
				n.content.repository?.nameWithOwner.toLowerCase() !==
				gh.repo.toLowerCase()
			)
				continue;
			items.push({
				itemId: n.id,
				column: n.status
					? (board.columnOf.get(n.status.optionId) ?? null)
					: null,
				number: n.content.number as number,
				state: n.content.state as string,
			});
		}
		after = data.node.items.pageInfo.hasNextPage
			? data.node.items.pageInfo.endCursor
			: null;
	} while (after);
	return items;
}

export async function moveItem(
	gh: Gh,
	board: Board,
	itemId: string,
	column: ColumnKey,
) {
	const optionId = board.options[column];
	if (!optionId) throw new Error(`Board has no "${column}" column`);
	await gh.mutate(
		`move item ${itemId} → ${column}`,
		`mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
			updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }) {
				projectV2Item { id }
			}
		}`,
		{ p: board.id, i: itemId, f: board.statusFieldId, o: optionId },
	);
}

export async function addToBoard(
	gh: Gh,
	board: Board,
	contentId: string,
	column: ColumnKey,
) {
	const res = await gh.mutate<{
		addProjectV2ItemById: { item: { id: string } };
	}>(
		`add ${contentId} to board`,
		`mutation($p: ID!, $c: ID!) {
			addProjectV2ItemById(input: { projectId: $p, contentId: $c }) { item { id } }
		}`,
		{ p: board.id, c: contentId },
	);
	if (res) await moveItem(gh, board, res.addProjectV2ItemById.item.id, column);
}

/** Built-in board workflows; they can be read but not enabled via the API. */
export async function boardWorkflows(gh: Gh, board: Board) {
	const data = await gh.query<{
		node: { workflows: { nodes: { name: string; enabled: boolean }[] } };
	}>(
		`query($id: ID!) {
			node(id: $id) { ... on ProjectV2 { workflows(first: 50) { nodes { name enabled } } } }
		}`,
		{ id: board.id },
	);
	return data.node.workflows.nodes;
}
