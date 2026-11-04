import {
	type Ask,
	askNumber,
	askText,
	choose,
	confirm,
	type Say,
} from "./ask.ts";
import type { Config } from "./config.ts";
import type { Login } from "./providers/login.ts";

type Provider = Config["provider"];

const loginHint = (l: Login) =>
	l.ok ? "logged in" : l.installed ? "not logged in" : "not installed";

/** Picks the provider, defaulting to the one that is logged in. */
export function askProvider(
	ask: Ask,
	say: Say,
	logins: Record<Provider, Login>,
): Provider {
	const def = !logins.claude.ok && logins.codex.ok ? 1 : 0;
	return choose<Provider>(
		ask,
		say,
		"Which agent CLI runs the workers?",
		[
			{
				value: "claude",
				label: "Claude Code",
				hint: `Claude subscription, ${loginHint(logins.claude)}`,
			},
			{
				value: "codex",
				label: "Codex",
				hint: `ChatGPT plan, ${loginHint(logins.codex)}`,
			},
		],
		def,
	);
}

export type Identity = Config["identity"]["mode"];

export function askIdentity(ask: Ask, say: Say): Identity {
	return choose<Identity>(ask, say, "Who should kanbot talk as on GitHub?", [
		{
			value: "user",
			label: "You",
			hint: "no setup; comments end with a 🤖 kanbot line",
		},
		{
			value: "app",
			label: "Its own bot",
			hint: "creates a GitHub App; clear who said what, and you can approve its PRs",
		},
	]);
}

/** Merge on approval. Only useful when someone other than you can approve. */
export function askMerge(
	ask: Ask,
	say: Say,
	identity: Identity,
): Partial<Config["merge"]> {
	if (identity === "user")
		say(
			"  As you, kanbot's PRs are yours, so only another collaborator can approve them.",
		);
	return confirm(
		ask,
		"Merge a kanbot PR when it's approved and checks pass?",
		identity === "app",
	)
		? { onApproval: true }
		: {};
}

/** Config keys that differ from defaults. Fields left out keep defaults. */
export type OptionsPatch = Partial<
	Pick<Config, "concurrency" | "wip" | "notify" | "review" | "codex">
>;

/** Offers the defaults, and asks for each only if the user wants to change them. */
export function askOptions(ask: Ask, say: Say): OptionsPatch {
	say("These defaults suit most repos:");
	say("  3 agents at once");
	say("  No limit on items waiting for you");
	say("  Desktop notifications, no webhook");
	say("  No Copilot review");
	if (!confirm(ask, "Change any of these?", false)) return {};

	const patch: OptionsPatch = {};
	const concurrency = askNumber(ask, say, "Agents at once?", 3) ?? 3;
	if (concurrency !== 3) patch.concurrency = concurrency;

	say(
		"  New work pauses when this many PRs and plans wait on you. 5 suits one person.",
	);
	const wip = askNumber(ask, say, "Limit on items waiting for you?", null, {
		none: "none",
	});
	if (wip !== null) patch.wip = { awaitingHuman: wip };

	const webhook = askText(
		ask,
		say,
		"Webhook for phone alerts, e.g. https://ntfy.sh/<topic> (Enter to skip):",
		(s) => (URL.canParse(s) ? null : "Not a URL. Try again, or Enter to skip."),
	);
	if (webhook) patch.notify = { webhook } as Config["notify"];

	if (
		confirm(
			ask,
			"Have Copilot review PRs too? Needs a paid plan; each review uses credits.",
			false,
		)
	)
		patch.review = { copilot: true } as Config["review"];
	return patch;
}

export type BoardChoice =
	| { kind: "create" }
	| { kind: "link"; owner: string; number: number }
	| { kind: "skip" };

export function askBoard(
	ask: Ask,
	say: Say,
	parse: (url: string) => { owner: string; number: number } | null,
): BoardChoice {
	const kind = choose<BoardChoice["kind"]>(
		ask,
		say,
		"kanbot runs from a GitHub Project board with six columns.",
		[
			{ value: "create", label: "Create a new board", hint: "recommended" },
			{ value: "link", label: "Use an existing board" },
			{ value: "skip", label: "Skip", hint: "run `kanbot board create` later" },
		],
	);
	if (kind !== "link") return { kind };
	const url = askText(
		ask,
		say,
		"Project URL (github.com/users/<owner>/projects/<n>):",
		(s) =>
			parse(s) ? null : "Not a project URL. Try again, or Enter to skip.",
	);
	const p = url ? parse(url) : null;
	return p ? { kind, ...p } : { kind: "skip" };
}
