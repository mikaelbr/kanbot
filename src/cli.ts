#!/usr/bin/env bun
import { runCommand, runMain } from "citty";
import { formatError } from "./errors.ts";
import { log } from "./log.ts";
import { main } from "./main.ts";
import { versionNotice } from "./templates.ts";

const args = process.argv.slice(2);
const usage =
	!args.length ||
	args.some((a) => a === "--help" || a === "-h") ||
	(args.length === 1 && (args[0] === "--version" || args[0] === "-v"));

// citty prints usage for help, version and a bare `kanbot`.
if (usage) {
	await runMain(main);
} else {
	// These set the version themselves, report it, or print shell code.
	if (!["init", "upgrade", "doctor", "completion"].includes(args[0] ?? "")) {
		const notice = await versionNotice(process.cwd());
		if (notice) log.warn(notice);
	}
	try {
		await runCommand(main, { rawArgs: args });
	} catch (e) {
		// Leading positionals name the command, e.g. "board create".
		const end = args.findIndex((a) => a.startsWith("-"));
		const command = args.slice(0, end < 0 ? undefined : end).join(" ");
		console.error(
			formatError(e, { debug: !!process.env.KANBOT_DEBUG, command }),
		);
		process.exit(1);
	}
}
