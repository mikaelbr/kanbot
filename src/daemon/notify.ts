import type { Config } from "../config.ts";
import { log } from "../log.ts";

/**
 * Agents act as your own account, so GitHub never notifies you about their
 * work. This is the replacement: desktop notifications and/or a webhook.
 */
export class Notifier {
	constructor(private config: Config["notify"]) {}

	send(title: string, message: string, url?: string) {
		log.info(`🔔 ${title} — ${message}${url ? ` ${url}` : ""}`);
		if (this.config.desktop) desktop(title, message).catch(() => {});
		if (this.config.webhook) {
			fetch(this.config.webhook, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					Title: title,
					...(url ? { Click: url } : {}),
				},
				body: JSON.stringify({ title, message, url }),
			}).catch((e) => log.warn(`webhook failed: ${e}`));
		}
	}
}

async function desktop(title: string, message: string) {
	const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	const cmd =
		process.platform === "darwin"
			? [
					"osascript",
					"-e",
					`display notification "${esc(message)}" with title "autogh" subtitle "${esc(title)}"`,
				]
			: ["notify-send", `autogh: ${title}`, message];
	await Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" }).exited;
}
