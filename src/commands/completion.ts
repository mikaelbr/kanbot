import { basename } from "node:path";
import { defineCommand } from "citty";
import { buildSpec, render, SHELLS, type Shell } from "../completion.ts";
import { UserError } from "../errors.ts";

export default defineCommand({
	meta: {
		name: "completion",
		description: "Print a shell completion script (zsh, bash or fish)",
	},
	args: {
		shell: {
			type: "enum",
			options: [...SHELLS],
			description: "Target shell (default: $SHELL)",
		},
	},
	async run({ args }) {
		const shell = args.shell ?? basename(process.env.SHELL ?? "");
		if (!SHELLS.includes(shell as Shell))
			throw new UserError("Could not detect your shell.", {
				why: `$SHELL is "${shell}", which is not supported.`,
				fix: `kanbot completion --shell ${SHELLS.join("|")}`,
				docs: "getting-started#shell-completion",
				more: "",
			});
		const { main } = await import("../main.ts");
		process.stdout.write(render(shell as Shell, await buildSpec(main)));
	},
});
