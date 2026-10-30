import { defineCommand } from "citty";
import pkg from "../package.json" with { type: "json" };

export const main = defineCommand({
	meta: {
		name: "autogh",
		version: pkg.version,
		description: "Run an autonomous dev team from a GitHub Project board",
	},
	subCommands: {
		init: () => import("./commands/init.ts").then((m) => m.default),
		board: () => import("./commands/board.ts").then((m) => m.default),
		sync: () => import("./commands/sync.ts").then((m) => m.default),
		doctor: () => import("./commands/doctor.ts").then((m) => m.default),
		run: () => import("./commands/run.ts").then((m) => m.default),
		status: () => import("./commands/status.ts").then((m) => m.default),
		completion: () => import("./commands/completion.ts").then((m) => m.default),
	},
});
