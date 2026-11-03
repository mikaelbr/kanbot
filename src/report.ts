import { UserError } from "./errors.ts";

/** A PR or issue touched in the report period, with its comments. */
export type Activity = {
	kind: "pr" | "issue";
	number: number;
	title: string;
	url: string;
	/** PRs only. */
	headRefName?: string;
	createdAt: string;
	mergedAt?: string | null;
	comments: { body: string; createdAt: string }[];
};

/** The board right now, from the snapshot. */
export type BoardNow = {
	waiting: number;
	limit: number | null;
	needsHuman: number;
	/** Open cards in Planning, Ready, In Progress or Review. */
	active: number;
};

export type Loops = {
	review: number;
	ci: number;
	conflict: number;
	feedback: number;
};

export type Health = "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "INACTIVE";

export type Report = {
	since: string;
	until: string;
	merged: {
		number: number;
		title: string;
		url: string;
		cycleMs: number;
		waitMs: number | null;
	}[];
	loops: Loops;
	needsHuman: { number: number; url: string; reason: string }[];
	now: BoardNow;
	health: Health;
	why: string[];
	next: string[];
};

const LOOP_MARKERS: Record<keyof Loops, string> = {
	review: "fixed",
	ci: "ci",
	conflict: "conflict",
	feedback: "feedback-round",
};

/** True for `<!-- kanbot:kind -->` and `<!-- kanbot:kind:… -->`. */
const has = (body: string, kind: string) =>
	body.includes(`<!-- kanbot:${kind} `) ||
	body.includes(`<!-- kanbot:${kind}:`);

/** `7d`, `2w`, `12h` or `YYYY-MM-DD` → start of the period. */
export function parseSince(value: string, now = Date.now()): Date {
	const m = value.match(/^(\d+)([hdw])$/);
	if (m) {
		const hours = { h: 1, d: 24, w: 24 * 7 }[m[2] as "h" | "d" | "w"];
		return new Date(now - Number(m[1]) * hours * 3_600_000);
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const d = new Date(`${value}T00:00:00Z`);
		if (!Number.isNaN(d.getTime())) return d;
	}
	throw new UserError(`Can't read --since "${value}".`, {
		why: "Use a duration like 7d, 2w or 12h, or a date like 2026-10-01.",
		fix: "kanbot report --since 7d",
		more: "",
	});
}

/** The reason line from a `needs-human` or `blocked` comment. */
export function reasonOf(body: string): string {
	const line =
		body
			.replace(/<sub>.*?<\/sub>/g, "")
			.replace(/<!--.*?-->/g, "")
			.replace(/^\s*\*\*[^*]+\*\*\s*/m, "")
			.split("\n")
			.map((l) => l.trim())
			.find((l) => l && !l.startsWith("Remove `")) ?? "";
	return line.length > 90 ? `${line.slice(0, 89)}…` : line || "no reason given";
}

export function median(xs: number[]): number | null {
	if (!xs.length) return null;
	const s = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2
		? (s[mid] as number)
		: ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** Short duration like `45m`, `6h` or `2d 4h`. */
export function duration(ms: number): string {
	const m = Math.max(0, Math.floor(ms / 60_000));
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h`;
	const d = Math.floor(h / 24);
	return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

export function buildReport(
	activity: Activity[],
	now: BoardNow,
	since: Date,
	until = new Date(),
): Report {
	const inPeriod = (at: string) => Date.parse(at) >= since.getTime();
	const loops: Loops = { review: 0, ci: 0, conflict: 0, feedback: 0 };
	const merged: Report["merged"] = [];

	for (const a of activity) {
		if (a.kind !== "pr" || !a.headRefName?.startsWith("kanbot/")) continue;
		if (!a.mergedAt || !inPeriod(a.mergedAt)) continue;
		const mergedAt = Date.parse(a.mergedAt);
		for (const c of a.comments)
			for (const [k, kind] of Object.entries(LOOP_MARKERS))
				if (has(c.body, kind)) loops[k as keyof Loops]++;
		// The last "agent review complete" before merge starts the final wait.
		const ready = a.comments
			.filter(
				(c) => has(c.body, "ready") && Date.parse(c.createdAt) <= mergedAt,
			)
			.at(-1);
		merged.push({
			number: a.number,
			title: a.title,
			url: a.url,
			cycleMs: mergedAt - Date.parse(a.createdAt),
			waitMs: ready ? mergedAt - Date.parse(ready.createdAt) : null,
		});
	}

	const needsHuman = activity.flatMap((a) =>
		a.comments
			.filter(
				(c) =>
					inPeriod(c.createdAt) &&
					(has(c.body, "needs-human") || has(c.body, "blocked")),
			)
			.map((c) => ({ number: a.number, url: a.url, reason: reasonOf(c.body) })),
	);

	const report = {
		since: since.toISOString(),
		until: until.toISOString(),
		merged,
		loops,
		needsHuman,
		now,
	};
	return { ...report, ...healthOf(report), next: nextSteps(report) };
}

type Base = Omit<Report, "health" | "why" | "next">;

/** Board health from fixed rules, so it means the same every week. */
export function healthOf(r: Base): { health: Health; why: string[] } {
	const { now } = r;
	if (!r.merged.length && !now.active)
		return { health: "INACTIVE", why: ["Nothing merged and no active cards."] };
	const why: string[] = [];
	if (!r.merged.length && (now.waiting || now.needsHuman)) {
		why.push(`Nothing merged, ${now.waiting} item(s) waiting on you.`);
		return { health: "OFF_TRACK", why };
	}
	if (now.limit !== null && now.waiting >= now.limit)
		why.push(`WIP limit reached (${now.waiting}/${now.limit}).`);
	if (now.needsHuman)
		why.push(`${now.needsHuman} card(s) labeled needs-human.`);
	return { health: why.length ? "AT_RISK" : "ON_TRACK", why };
}

/** At most two concrete changes to try. */
export function nextSteps(r: Base): string[] {
	const out: string[] = [];
	const n = r.merged.length;
	const cycle = median(r.merged.map((m) => m.cycleMs));
	const wait = median(
		r.merged.flatMap((m) => (m.waitMs === null ? [] : [m.waitMs])),
	);
	if (r.now.needsHuman)
		out.push("Clear needs-human cards: fix the cause, then remove the label.");
	if (cycle && wait !== null && wait > cycle / 2)
		out.push(
			"Most cycle time is waiting on you. Run `kanbot status` and clear the queue.",
		);
	if (n && r.loops.ci > n)
		out.push(
			"CI fails often. Map a `verify` capability that runs the same checks.",
		);
	if (n && r.loops.review / n > 2)
		out.push(
			"Reviews often need fixes. Add what they catch to project-memory.",
		);
	if (n && r.loops.conflict / n > 1)
		out.push(
			"Conflicts are frequent. Lower `concurrency` or split cards smaller.",
		);
	return out.slice(0, 2);
}

const HEALTH_LABEL: Record<Health, string> = {
	ON_TRACK: "On track",
	AT_RISK: "At risk",
	OFF_TRACK: "Off track",
	INACTIVE: "Inactive",
};

/** Markdown for the terminal and for the board's status update. */
export function renderReport(r: Report): string {
	const day = (iso: string) => iso.slice(0, 10);
	const med = (xs: number[]) => {
		const m = median(xs);
		return m === null ? "—" : duration(m);
	};
	const waits = r.merged.flatMap((m) => (m.waitMs === null ? [] : [m.waitMs]));
	const { loops, now } = r;
	const lines = [
		`**${HEALTH_LABEL[r.health]}** · ${day(r.since)} → ${day(r.until)}`,
		...r.why.map((w) => `> ${w}`),
		"",
		`- Merged: ${r.merged.length} PR(s)`,
		`- Cycle, PR opened → merged: median ${med(r.merged.map((m) => m.cycleMs))}`,
		`- Waiting on you, agent-reviewed → merged: median ${med(waits)}`,
		`- Fix loops: ${loops.review} review, ${loops.ci} CI, ${loops.conflict} conflict, ${loops.feedback} feedback`,
		`- Waiting on you now: ${now.waiting}${now.limit === null ? "" : ` of ${now.limit}`}`,
		`- needs-human: ${r.needsHuman.length} this period`,
		...r.needsHuman.slice(0, 5).map((h) => `  - #${h.number} ${h.reason}`),
	];
	if (r.next.length) lines.push("", "**Next**", ...r.next.map((s) => `- ${s}`));
	return lines.join("\n");
}
