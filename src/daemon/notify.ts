import notifier from "node-notifier";
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
		if (this.config.desktop)
			desktop(title, message, url).catch((e) =>
				log.warn(`desktop notification failed: ${e}`),
			);
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

function desktop(title: string, message: string, url?: string) {
	return new Promise<void>((resolve, reject) =>
		notifier.notify(
			{
				title: "kanbot",
				subtitle: title,
				message,
				...(url ? { open: url } : {}),
			},
			(err) => (err ? reject(err) : resolve()),
		),
	);
}
