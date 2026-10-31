/**
 * Hidden HTML-comment markers. Agents post as the human's own account, so the
 * marker is the only way to tell kanbot output apart from human input, and it
 * doubles as the idempotency key for every side effect.
 */

const ANY = /<!--\s*kanbot(?::[^>]*)?-->/;
const PLAN_START = "<!-- kanbot:plan:start -->";
const PLAN_END = "<!-- kanbot:plan:end -->";

export function marker(...parts: (string | number)[]) {
	return parts.length
		? `<!-- kanbot:${parts.join(":")} -->`
		: "<!-- kanbot -->";
}

export function isKanbot(body: string) {
	return ANY.test(body);
}

export function hasMarker(body: string, ...parts: (string | number)[]) {
	return body.includes(marker(...parts));
}

/** All values `x` from markers shaped `<!-- kanbot:<kind>:x -->`. */
export function markerValues(body: string, kind: string): string[] {
	const re = new RegExp(`<!-- kanbot:${kind}:([^ ]+) -->`, "g");
	return [...body.matchAll(re)].map((m) => m[1] as string);
}

export function extractPlan(body: string): string | null {
	const start = body.indexOf(PLAN_START);
	const end = body.indexOf(PLAN_END);
	if (start === -1 || end === -1 || end < start) return null;
	return body.slice(start + PLAN_START.length, end).trim();
}

/** The human-written part of an issue body (everything outside the plan block). */
export function stripPlan(body: string): string {
	const start = body.indexOf(PLAN_START);
	const end = body.indexOf(PLAN_END);
	if (start === -1 || end === -1) return body.trim();
	return (body.slice(0, start) + body.slice(end + PLAN_END.length)).trim();
}

export function withPlan(body: string, plan: string): string {
	const block = `${PLAN_START}\n\n${plan.trim()}\n\n${PLAN_END}`;
	const human = stripPlan(body);
	return human ? `${human}\n\n---\n\n${block}` : block;
}

const DESC_START = "<!-- kanbot:desc:start -->";
const DESC_END = "<!-- kanbot:desc:end -->";
/** Where the daemon's own PR body sections begin, for bodies without a desc block. */
const PR_TAIL = /^(### Risks|### Checks|> Exploratory|Closes #)/m;

/**
 * Put the agent-written PR description in a marked block, replacing the
 * previous one and keeping the daemon's sections (risks, checks, Closes #n).
 */
export function withDescription(body: string, description: string): string {
	const block = `${DESC_START}\n\n${description.trim()}\n\n${DESC_END}`;
	const start = body.indexOf(DESC_START);
	const end = body.indexOf(DESC_END);
	if (start !== -1 && end > start)
		return body.slice(0, start) + block + body.slice(end + DESC_END.length);
	const tail = body.search(PR_TAIL);
	return tail === -1 ? block : `${block}\n\n${body.slice(tail)}`;
}

/** Embed machine-readable data in a comment. */
export function embedJson(kind: string, data: unknown) {
	return `<!-- kanbot-data:${kind} ${Buffer.from(JSON.stringify(data)).toString("base64")} -->`;
}

export function readJson<T>(body: string, kind: string): T | null {
	const m = body.match(
		new RegExp(`<!-- kanbot-data:${kind} ([A-Za-z0-9+/=]+) -->`),
	);
	if (!m?.[1]) return null;
	return JSON.parse(Buffer.from(m[1], "base64").toString("utf8")) as T;
}
