import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import pkg from "../package.json" with { type: "json" };
import knownHashes from "./known-hashes.json" with { type: "json" };

/*
 * Template files installed into consumer repos, and how upgrades treat them.
 * `.kanbot/manifest.json` records the hash of each template as installed, so an
 * upgrade can tell files you edited from files it may replace.
 */

export const TEMPLATES = join(import.meta.dir, "..", "templates");
const MANIFEST = join(".kanbot", "manifest.json");
export const NEW_SUFFIX = ".kanbot-new";

/**
 * - `kanbot`: belongs to kanbot; always replaced.
 * - `user`: yours after install; never touched again.
 * - `shared`: replaced while unedited; your edits get a `.kanbot-new` copy.
 */
export type FileClass = "kanbot" | "user" | "shared";

const CLASSES: [prefix: string, FileClass][] = [
	[".github/workflows/kanbot-", "kanbot"],
	["AGENTS.md", "user"],
	["CLAUDE.md", "user"],
	[".agents/skills/project-conventions/", "user"],
	[".github/workflows/ci.yml", "user"],
	[".github/ISSUE_TEMPLATE/", "user"],
	[".github/pull_request_template.md", "user"],
];

export function fileClass(path: string): FileClass {
	return CLASSES.find(([prefix]) => path.startsWith(prefix))?.[1] ?? "shared";
}

/** Git blob id, so hashes of past versions can be read from git history. */
export function hash(content: Uint8Array) {
	const h = new Bun.CryptoHasher("sha1");
	h.update(`blob ${content.length}\0`);
	h.update(content);
	return h.digest("hex");
}

export type Manifest = { version: string; files: Record<string, string> };

export async function readManifest(root: string): Promise<Manifest | null> {
	const file = Bun.file(join(root, MANIFEST));
	return (await file.exists()) ? ((await file.json()) as Manifest) : null;
}

async function writeManifest(root: string, files: Record<string, string>) {
	const sorted = Object.fromEntries(
		Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
	);
	const manifest: Manifest = { version: pkg.version, files: sorted };
	await Bun.write(
		join(root, MANIFEST),
		`${JSON.stringify(manifest, null, "\t")}\n`,
	);
}

/** Template files as repo-relative paths with forward slashes. */
export async function listTemplates(dir = TEMPLATES) {
	const out = new Map<string, Uint8Array>();
	const walk = async (d: string) => {
		for (const e of await readdir(d, { withFileTypes: true })) {
			const p = join(d, e.name);
			if (e.isDirectory()) await walk(p);
			else
				out.set(
					relative(dir, p).split(sep).join("/"),
					await Bun.file(p).bytes(),
				);
		}
	};
	await walk(dir);
	return out;
}

export type Change = {
	path: string;
	action:
		| "add" // new template, written
		| "update" // unedited, replaced
		| "conflict" // edited by you; new version goes to <path>.kanbot-new
		| "deleted" // you deleted it; left out
		| "removed"; // no longer shipped; left in place
	content?: Uint8Array;
};

export type Plan = { changes: Change[]; files: Record<string, string> };

type Options = {
	templates?: string;
	known?: Record<string, string[]>;
	/** `init --force`: overwrite everything. */
	force?: boolean;
};

/**
 * Work out what an upgrade would change. Without a manifest, a file that
 * matches any past template version counts as unedited.
 */
export async function planUpgrade(
	root: string,
	opts: Options = {},
): Promise<Plan> {
	const templates = await listTemplates(opts.templates);
	const known: Record<string, string[]> = opts.known ?? knownHashes;
	const manifest = await readManifest(root);
	const files: Record<string, string> = {};
	const changes: Change[] = [];

	for (const [path, content] of templates) {
		const next = hash(content);
		const target = join(root, path);
		const recorded = manifest?.files[path];
		const write = (action: Change["action"]) => {
			changes.push({ path, action, content });
			files[path] = next;
		};

		if (!existsSync(target)) {
			if (recorded && !opts.force) {
				changes.push({ path, action: "deleted" });
				files[path] = recorded;
			} else write("add");
			continue;
		}
		const current = hash(await Bun.file(target).bytes());
		if (current === next) {
			files[path] = next;
			continue;
		}
		if (opts.force) {
			write("update");
			continue;
		}
		const cls = fileClass(path);
		if (cls === "user") {
			files[path] = recorded ?? current;
			continue;
		}
		if (cls === "shared" && recorded === next) {
			// Template unchanged since install: your edits stand.
			files[path] = next;
			continue;
		}
		const unedited = recorded
			? current === recorded
			: (known[path] ?? []).includes(current);
		if (cls === "kanbot" || unedited) {
			write("update");
			continue;
		}
		// Record the new version as the base, so once you merge it, later
		// upgrades only flag the file when the template changes again.
		changes.push({ path, action: "conflict", content });
		files[path] = next;
	}

	for (const path of Object.keys(manifest?.files ?? {})) {
		if (!templates.has(path) && existsSync(join(root, path)))
			changes.push({ path, action: "removed" });
	}
	return { changes, files };
}

/** Write the planned files and the manifest. */
export async function applyUpgrade(root: string, plan: Plan) {
	for (const c of plan.changes) {
		if (!c.content) continue;
		const to = join(
			root,
			c.action === "conflict" ? `${c.path}${NEW_SUFFIX}` : c.path,
		);
		await mkdir(dirname(to), { recursive: true });
		await Bun.write(to, c.content);
	}
	await writeManifest(root, plan.files);
}

/** Leftover `.kanbot-new` files waiting to be merged. */
export async function pendingMerges(root: string, dir = TEMPLATES) {
	const paths = [...(await listTemplates(dir)).keys()];
	return paths.filter((p) => existsSync(join(root, `${p}${NEW_SUFFIX}`)));
}
