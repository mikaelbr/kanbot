import type { ArgsDef, CommandDef, Resolvable } from "citty";

export const SHELLS = ["zsh", "bash", "fish"] as const;
export type Shell = (typeof SHELLS)[number];

type Flag = {
	name: string;
	alias: string[];
	description: string;
	takesValue: boolean;
	options: string[];
};

export type Spec = {
	name: string;
	description: string;
	flags: Flag[];
	/** Values for the first positional argument. */
	values: string[];
	subs: Spec[];
};

/** Positional values citty can't describe, by command path. */
const VALUES: Record<string, string[]> = {
	provider: ["claude", "codex"],
};

async function resolve<T>(
	v: Resolvable<T> | undefined,
): Promise<T | undefined> {
	return typeof v === "function" ? (v as () => T | Promise<T>)() : v;
}

const HELP: Flag = {
	name: "help",
	alias: ["h"],
	description: "Show help",
	takesValue: false,
	options: [],
};

const VERSION: Flag = {
	name: "version",
	alias: [],
	description: "Show version",
	takesValue: false,
	options: [],
};

/** Walks the citty command tree, loading lazy subcommands. */
export async function buildSpec(
	cmd: CommandDef<ArgsDef>,
	name?: string,
	path: string[] = [],
): Promise<Spec> {
	const meta = await resolve(cmd.meta);
	const args = (await resolve(cmd.args)) ?? {};
	const subs = (await resolve(cmd.subCommands)) ?? {};
	const flags: Flag[] = Object.entries(args)
		.filter(([, a]) => a.type !== "positional")
		.map(([key, a]) => ({
			name: key,
			alias: "alias" in a && a.alias !== undefined ? [a.alias].flat() : [],
			description: a.description ?? "",
			takesValue: a.type !== "boolean",
			options: a.type === "enum" ? (a.options ?? []) : [],
		}));
	flags.push(HELP);
	if (meta?.version) flags.push(VERSION);
	return {
		name: name ?? meta?.name ?? "",
		description: meta?.description ?? "",
		flags,
		values: VALUES[path.join(" ")] ?? [],
		subs: await Promise.all(
			Object.entries(subs).map(async ([key, sub]) =>
				buildSpec((await resolve(sub)) as CommandDef<ArgsDef>, key, [
					...path,
					key,
				]),
			),
		),
	};
}

export function render(shell: Shell, spec: Spec): string {
	return { zsh, bash, fish }[shell](spec);
}

const dashed = (f: string) => (f.length === 1 ? `-${f}` : `--${f}`);
const sq = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

function walk(spec: Spec, path: string[] = []): [string[], Spec][] {
	return [
		[path, spec],
		...spec.subs.flatMap((s) => walk(s, [...path, s.name])),
	];
}

function zsh(root: Spec): string {
	const esc = (s: string) => s.replace(/([[\]:\\])/g, "\\$1");
	const fn = (path: string[]) => [`_${root.name}`, ...path].join("_");
	const funcs = walk(root).map(([path, spec]) => {
		const flags = spec.flags.map((f) => {
			const names = [f.name, ...f.alias].map(dashed);
			const excl = names.length > 1 ? `(${names.join(" ")})` : "";
			const value = !f.takesValue
				? ""
				: f.options.length
					? `:${f.name}:(${f.options.join(" ")})`
					: `:${f.name}: `;
			const spec = `[${esc(f.description)}]${value}`;
			return names.length > 1
				? `${sq(excl)}{${names.join(",")}}${sq(spec)}`
				: sq(names[0] + spec);
		});
		if (spec.values.length)
			flags.push(sq(`1:value:(${spec.values.join(" ")})`));
		if (!spec.subs.length)
			return `${fn(path)}() {\n\t_arguments -s \\\n\t\t${flags.join(" \\\n\t\t")}\n}`;
		const cmds = spec.subs.map((s) => sq(`${esc(s.name)}:${s.description}`));
		const cases = spec.subs.map(
			(s) => `\t\t${s.name}) ${fn([...path, s.name])} ;;`,
		);
		return `${fn(path)}() {
	local curcontext="$curcontext" state line
	_arguments -C \\
		${flags.join(" \\\n\t\t")} \\
		'1: :->cmd' \\
		'*:: :->args'
	case $state in
	cmd)
		local -a cmds=(${cmds.join(" ")})
		_describe command cmds ;;
	args)
		case $line[1] in
${cases.join("\n")}
		esac ;;
	esac
}`;
	});
	return `#compdef ${root.name}

${funcs.join("\n\n")}

if [ "$funcstack[1]" = "_${root.name}" ]; then
	_${root.name} "$@"
else
	compdef _${root.name} ${root.name}
fi
`;
}

function bash(root: Spec): string {
	const nodes = walk(root);
	const specCases = nodes.map(([path, spec]) => {
		const subs = spec.subs.map((s) => s.name).join(" ");
		const flags = spec.flags
			.flatMap((f) => [f.name, ...f.alias].map(dashed))
			.join(" ");
		return `\t${JSON.stringify(path.join(" "))}) subs=${sq(subs)}; vals=${sq(spec.values.join(" "))}; flags=${sq(flags)} ;;`;
	});
	const valueCases = nodes.flatMap(([path, spec]) =>
		spec.flags
			.filter((f) => f.takesValue)
			.map((f) => {
				const pattern = [f.name, ...f.alias]
					.map((n) => JSON.stringify(`${path.join(" ")}:${dashed(n)}`))
					.join("|");
				const action = f.options.length
					? `COMPREPLY=($(compgen -W ${sq(f.options.join(" "))} -- "$cur")); return`
					: "return";
				return `\t${pattern}) ${action} ;;`;
			}),
	);
	const n = root.name;
	return `_${n}_spec() {
	case "$1" in
${specCases.join("\n")}
	esac
}

_${n}() {
	local cur=\${COMP_WORDS[COMP_CWORD]} prev=\${COMP_WORDS[COMP_CWORD-1]}
	local cmdpath="" subs vals flags i
	_${n}_spec ""
	for ((i = 1; i < COMP_CWORD; i++)); do
		if [[ " $subs " == *" \${COMP_WORDS[i]} "* ]]; then
			cmdpath="\${cmdpath:+$cmdpath }\${COMP_WORDS[i]}"
			_${n}_spec "$cmdpath"
		fi
	done
	case "$cmdpath:$prev" in
${valueCases.join("\n")}
	esac
	COMPREPLY=($(compgen -W "$subs $vals $flags" -- "$cur"))
}

complete -F _${n} ${n}
`;
}

function fish(root: Spec): string {
	const n = root.name;
	const lines = [`complete -c ${n} -f`];
	for (const [path, spec] of walk(root)) {
		const seen = path.map((p) => `__fish_seen_subcommand_from ${p}`);
		if (spec.subs.length) {
			const names = spec.subs.map((s) => s.name).join(" ");
			const cond = path.length
				? [...seen, `not __fish_seen_subcommand_from ${names}`].join("; and ")
				: "__fish_use_subcommand";
			for (const s of spec.subs)
				lines.push(
					`complete -c ${n} -n ${sq(cond)} -a ${s.name} -d ${sq(s.description)}`,
				);
		}
		if (spec.values.length)
			lines.push(
				`complete -c ${n} -n ${sq(seen.join("; and "))} -a ${sq(spec.values.join(" "))}`,
			);
		for (const f of spec.flags) {
			const parts = [`complete -c ${n}`];
			if (seen.length) parts.push(`-n ${sq(seen.join("; and "))}`);
			parts.push(`-l ${f.name}`);
			for (const a of f.alias)
				parts.push(a.length === 1 ? `-s ${a}` : `-l ${a}`);
			if (f.takesValue) parts.push("-x");
			if (f.options.length) parts.push(`-a ${sq(f.options.join(" "))}`);
			if (f.description) parts.push(`-d ${sq(f.description)}`);
			lines.push(parts.join(" "));
		}
	}
	return `${lines.join("\n")}\n`;
}
