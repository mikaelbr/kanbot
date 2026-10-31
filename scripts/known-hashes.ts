/**
 * Regenerate src/known-hashes.json: every version of every current template
 * file in git history plus the working tree. `kanbot upgrade` uses it to tell
 * unedited files from edited ones in repos installed before the manifest.
 */
import { git } from "../src/daemon/git.ts";
import { hash, listTemplates } from "../src/templates.ts";

const root = `${import.meta.dir}/..`;
const current = await listTemplates();
const known = new Map<string, Set<string>>(
	[...current].map(([p, c]) => [p, new Set([hash(c)])]),
);
const revs = (await git(root, "rev-list", "HEAD", "--", "templates")).split(
	"\n",
);
for (const rev of revs.filter(Boolean)) {
	const tree = await git(root, "ls-tree", "-r", rev, "templates/");
	for (const line of tree.split("\n")) {
		const m = line.match(/^\d+ blob ([0-9a-f]+)\ttemplates\/(.+)$/);
		if (m?.[1] && m[2]) known.get(m[2])?.add(m[1]);
	}
}
const out = Object.fromEntries(
	[...known]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([p, s]) => [p, [...s].sort()]),
);
await Bun.write(
	`${root}/src/known-hashes.json`,
	`${JSON.stringify(out, null, "\t")}\n`,
);
console.log(`known-hashes.json: ${known.size} files`);
