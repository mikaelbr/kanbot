import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { defineCommand } from "citty";
import { loadConfig, saveConfig } from "../config.ts";
import { UserError } from "../errors.ts";
import { appKeyPath, appManifest, convertManifest } from "../github/app.ts";
import { Gh } from "../github/gh.ts";
import { log } from "../log.ts";

const WAIT_MS = 10 * 60_000;

function openBrowser(url: string) {
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

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** A page that posts the manifest to GitHub, as the manifest flow requires. */
function formPage(action: string, manifest: unknown) {
	return `<!doctype html><meta charset="utf-8"><title>kanbot app</title>
<form id="f" method="post" action="${escAttr(action)}">
<input type="hidden" name="manifest" value="${escAttr(JSON.stringify(manifest))}">
<button>Create the kanbot app on GitHub</button></form>
<script>document.getElementById("f").submit()</script>`;
}

const page = (msg: string) =>
	new Response(
		`<!doctype html><meta charset="utf-8"><title>kanbot app</title><p>${msg}</p>`,
		{ headers: { "content-type": "text/html" } },
	);

const create = defineCommand({
	meta: {
		name: "create",
		description:
			"Create a GitHub App for kanbot to talk as, and switch to app mode",
	},
	args: {
		name: {
			type: "string",
			description: "App name, unique on GitHub (default: kanbot-<owner>)",
		},
	},
	async run({ args }) {
		const root = process.cwd();
		const config = await loadConfig(root);
		const gh = new Gh(config.repo);
		const owner = gh.owner;
		const { type } = await gh.rest<{ type: string }>(`users/${owner}`);
		const name = (args.name ?? `kanbot-${owner}`).slice(0, 34);
		const state = randomUUID();
		const action =
			type === "Organization"
				? `https://github.com/organizations/${owner}/settings/apps/new?state=${state}`
				: `https://github.com/settings/apps/new?state=${state}`;

		const got = Promise.withResolvers<string>();
		const server = Bun.serve({
			port: 0,
			hostname: "localhost",
			fetch(req): Response {
				const url = new URL(req.url);
				if (url.pathname === "/")
					return new Response(
						formPage(
							action,
							appManifest(name, `http://localhost:${url.port}/callback`),
						),
						{ headers: { "content-type": "text/html" } },
					);
				if (url.pathname !== "/callback")
					return new Response("", { status: 404 });
				const code = url.searchParams.get("code");
				if (url.searchParams.get("state") !== state || !code)
					return page("Unexpected request. Run `kanbot app create` again.");
				got.resolve(code);
				return page("App created. Go back to your terminal.");
			},
		});
		const start = `http://localhost:${server.port}/`;
		log.info(`Opening ${start} — confirm the app on GitHub.`);
		openBrowser(start);
		const timer = setTimeout(
			() => got.reject(new Error("timed out waiting for GitHub")),
			WAIT_MS,
		);
		let code: string;
		try {
			code = await got.promise;
		} catch (e) {
			throw new UserError("No app was created.", {
				why: String(e),
				fix: "kanbot app create",
				docs: "identity#app-mode",
			});
		} finally {
			clearTimeout(timer);
			server.stop();
		}

		const app = await convertManifest(code);
		const keyFile = appKeyPath(app.id);
		await mkdir(dirname(keyFile), { recursive: true });
		await Bun.write(keyFile, app.pem);
		await chmod(keyFile, 0o600);
		await saveConfig(root, {
			identity: { mode: "app", app: { id: app.id, slug: app.slug } },
		});
		const install = `https://github.com/apps/${app.slug}/installations/new`;
		log.info(`Created ${app.slug} (id ${app.id}). Key: ${keyFile}`);
		log.info(`Now install it on ${config.repo}: ${install}`);
		openBrowser(install);
		console.log(
			"\nThen commit .kanbot/config.yml, run `kanbot doctor` and restart the daemon.",
		);
	},
});

const link = defineCommand({
	meta: {
		name: "link",
		description: "Use a kanbot app you already created, e.g. for another repo",
	},
	args: {
		id: { type: "string", required: true, description: "GitHub App ID" },
		slug: {
			type: "string",
			required: true,
			description: "App slug, as in github.com/apps/<slug>",
		},
	},
	async run({ args }) {
		const root = process.cwd();
		const id = Number(args.id);
		if (!Number.isInteger(id))
			throw new UserError("--id must be a number.", {
				docs: "identity#use-the-app-in-another-repo",
			});
		await saveConfig(root, {
			identity: { mode: "app", app: { id, slug: args.slug } },
		});
		const config = await loadConfig(root);
		log.info(`kanbot talks as ${args.slug}[bot] in ${config.repo}.`);
		if (!existsSync(appKeyPath(id)))
			log.warn(`No private key at ${appKeyPath(id)}. Copy it there.`);
		log.info(
			`Install it on the repo if needed: https://github.com/apps/${args.slug}/installations/new`,
		);
	},
});

export default defineCommand({
	meta: {
		name: "app",
		description: "Manage the GitHub App kanbot talks as",
	},
	subCommands: { create, link },
});
