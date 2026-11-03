import { color } from "./color.ts";

/** Reads one answer. Null means no answer (end of input). */
export type Ask = (question: string) => string | null;
export type Say = (line: string) => void;

export type Choice<T> = { value: T; label: string; hint?: string };

/** Numbered list; Enter picks the default. */
export function choose<T>(
	ask: Ask,
	say: Say,
	question: string,
	choices: Choice<T>[],
	def = 0,
): T {
	say(color.bold(question));
	choices.forEach((c, i) => {
		const hint = c.hint ? color.dim(` — ${c.hint}`) : "";
		say(`  ${i + 1}. ${c.label}${hint}`);
	});
	for (;;) {
		const a = ask(`Pick 1-${choices.length} [${def + 1}]:`)?.trim();
		if (!a) return (choices[def] as Choice<T>).value;
		const picked =
			choices[Number(a) - 1] ??
			choices.find((c) => String(c.value) === a || c.label === a);
		if (picked) return picked.value;
		say(`  Type a number from 1 to ${choices.length}.`);
	}
}

export function confirm(ask: Ask, question: string, def: boolean): boolean {
	const a = ask(`${question} ${def ? "[Y/n]" : "[y/N]"}`)?.trim();
	if (!a) return def;
	return /^y/i.test(a);
}

/** A whole number ≥ min. With `none`, typing it returns null. */
export function askNumber(
	ask: Ask,
	say: Say,
	question: string,
	def: number | null,
	opts: { min?: number; none?: string } = {},
): number | null {
	const min = opts.min ?? 1;
	const shown = def ?? opts.none;
	for (;;) {
		const a = ask(`${question} [${shown}]`)?.trim();
		if (!a) return def;
		if (opts.none && a === opts.none) return null;
		const n = Number(a);
		if (Number.isInteger(n) && n >= min) return n;
		say(
			`  Type a whole number, ${min} or more${opts.none ? `, or "${opts.none}"` : ""}.`,
		);
	}
}

/** Free text; Enter keeps the default. `valid` returns an error to ask again. */
export function askText(
	ask: Ask,
	say: Say,
	question: string,
	valid: (s: string) => string | null = () => null,
): string | null {
	for (;;) {
		const a = ask(question)?.trim();
		if (!a) return null;
		const err = valid(a);
		if (!err) return a;
		say(`  ${err}`);
	}
}

/** Opens a URL in the default browser. Silent if it can't. */
export function openBrowser(url: string) {
	const cmd =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "explorer"
				: "xdg-open";
	try {
		Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore" });
	} catch {}
}
