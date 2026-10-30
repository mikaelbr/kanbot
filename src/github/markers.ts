/**
 * Hidden HTML-comment markers. Agents post as the human's own account, so the
 * marker is the only way to tell autogh output apart from human input, and it
 * doubles as the idempotency key for every side effect.
 */

const ANY = /<!--\s*autogh(?::[^>]*)?-->/;
const PLAN_START = "<!-- autogh:plan:start -->";
const PLAN_END = "<!-- autogh:plan:end -->";

export function marker(...parts: (string | number)[]) {
	return parts.length
		? `<!-- autogh:${parts.join(":")} -->`
		: "<!-- autogh -->";
}

export function isAutogh(body: string) {
	return ANY.test(body);
}

export function hasMarker(body: string, ...parts: (string | number)[]) {
	return body.includes(marker(...parts));
}

/** All values `x` from markers shaped `<!-- autogh:<kind>:x -->`. */
export function markerValues(body: string, kind: string): string[] {
	const re = new RegExp(`<!-- autogh:${kind}:([^ ]+) -->`, "g");
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

/** Embed machine-readable data in a comment. */
export function embedJson(kind: string, data: unknown) {
	return `<!-- autogh-data:${kind} ${Buffer.from(JSON.stringify(data)).toString("base64")} -->`;
}

export function readJson<T>(body: string, kind: string): T | null {
	const m = body.match(
		new RegExp(`<!-- autogh-data:${kind} ([A-Za-z0-9+/=]+) -->`),
	);
	if (!m?.[1]) return null;
	return JSON.parse(Buffer.from(m[1], "base64").toString("utf8")) as T;
}
