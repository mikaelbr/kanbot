export const DOCS_URL = "https://kanbot.mib.im";
const ISSUES_URL = "https://github.com/mikaelbr/kanbot/issues";

export type ErrorHelp = {
	/** Why it failed: the underlying error or the rule that was broken. */
	why?: string;
	/** What to do about it, usually a command. */
	fix?: string;
	/** Docs page and anchor, e.g. "configuration#config-file". */
	docs?: string;
	/** How to learn more. Defaults to `kanbot doctor`; "" hides it. */
	more?: string;
};

/** An expected failure. Printed without a stack trace. */
export class UserError extends Error {
	constructor(
		message: string,
		readonly help: ErrorHelp = {},
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "UserError";
	}
}

const INSTALL: Record<string, ErrorHelp> = {
	gh: {
		fix: "Install the GitHub CLI from https://cli.github.com, then run `gh auth login`.",
		docs: "getting-started#requirements",
	},
	git: {
		fix: "Install git from https://git-scm.com/downloads.",
		docs: "getting-started#requirements",
	},
	claude: {
		fix: "Install Claude Code, then run `claude auth login`.",
		docs: "providers#claude-code",
	},
	codex: {
		fix: "Install Codex (npm i -g @openai/codex), then run `codex login`.",
		docs: "providers#codex",
	},
};

/** Known failures from gh, git and the GitHub API, matched on message. */
const KNOWN: [RegExp, string, ErrorHelp][] = [
	[
		/gh auth login|not logged in|HTTP 401|Bad credentials/i,
		"GitHub CLI is not logged in.",
		{ fix: "gh auth login", docs: "getting-started#requirements" },
	],
	[
		/INSUFFICIENT_SCOPES|required scopes|scope.*project/i,
		"GitHub token is missing the `project` scope.",
		{ fix: "gh auth refresh -s project", docs: "getting-started#requirements" },
	],
	[
		/rate limit/i,
		"GitHub API rate limit reached.",
		{ fix: "Wait a few minutes and try again." },
	],
	[
		/Could not resolve to a ProjectV2/i,
		"Project board not found.",
		{
			fix: "Check `project` in .kanbot/config.yml, or run `kanbot board create`.",
			docs: "getting-started#create-the-board",
		},
	],
	[
		/Could not resolve to a Repository|HTTP 404/i,
		"GitHub repository not found, or gh has no access to it.",
		{
			fix: "Check `repo` in .kanbot/config.yml and run `gh repo view <owner/name>`.",
			docs: "configuration#config-file",
		},
	],
	[
		/not a git repository/i,
		"Not inside a git repository.",
		{ fix: "cd into your repo, or run `git init`." },
	],
	[
		/no git remotes|none of the git remotes/i,
		"This repo has no GitHub remote.",
		{
			fix: "git remote add origin <url> && git push -u origin HEAD",
			docs: "getting-started#set-up-a-repository",
		},
	],
	[
		/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|dial tcp|error connecting/i,
		"Could not reach GitHub.",
		{ fix: "Check your network connection and try again." },
	],
];

export type Described = ErrorHelp & { message: string; expected: boolean };

export function describeError(e: unknown, command = ""): Described {
	if (e instanceof UserError)
		return { message: e.message, ...e.help, expected: true };
	if (!(e instanceof Error)) return { message: String(e), expected: false };
	const raw = e.message.trim();

	// citty argument errors: unknown command, bad flag value, …
	if (e.name === "CLIError") {
		const unknown = (e as { code?: string }).code === "E_UNKNOWN_COMMAND";
		return {
			message: Bun.stripANSI(raw),
			fix: `Run \`kanbot ${unknown ? "" : `${command} `}--help\` to see valid options.`,
			docs: "usage",
			more: "",
			expected: true,
		};
	}

	const bin = raw.match(/Executable not found in \$PATH: "(.+)"/)?.[1];
	if (bin)
		return {
			message: `\`${bin}\` is not installed or not on PATH.`,
			why: raw,
			...INSTALL[bin],
			expected: true,
		};

	const known = KNOWN.find(([re]) => re.test(raw));
	if (known)
		return { message: known[1], why: raw, ...known[2], expected: true };
	const tool = raw.match(/^(gh|git) .* failed/)?.[1];
	if (tool)
		return {
			message: `A \`${tool}\` command failed.`,
			why: raw,
			fix:
				tool === "gh"
					? "Read the gh error above. `gh auth status` shows login and scopes."
					: "Read the git error above. `git status` shows the repo state.",
			expected: true,
		};
	return { message: raw, expected: false };
}

const indent = (s: string) => s.replace(/^(?=.)/gm, "  ");

export function formatError(
	e: unknown,
	opts: { debug?: boolean; command?: string } = {},
): string {
	const d = describeError(e, opts.command);
	const lines = [`✖ ${d.message}`];
	if (d.why) lines.push("", indent(d.why));
	lines.push("");
	if (d.fix) lines.push(`  Fix:  ${d.fix}`);
	if (d.docs) lines.push(`  Docs: ${DOCS_URL}/${d.docs}`);
	if (opts.debug && e instanceof Error && e.stack) {
		lines.push("", e.stack);
		if (e.cause instanceof Error && e.cause.stack)
			lines.push("", `Caused by: ${e.cause.stack}`);
	} else if (d.expected) {
		const more = d.more ?? "Run `kanbot doctor` to check your setup.";
		if (more) lines.push(`  More: ${more}`);
	} else {
		lines.push(
			"  More: rerun with KANBOT_DEBUG=1 for a stack trace.",
			`        If it looks like a bug, report it at ${ISSUES_URL}`,
		);
	}
	return lines.join("\n");
}
