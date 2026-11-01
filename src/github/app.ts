import { createSign } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "../config.ts";
import { UserError } from "../errors.ts";
import { Gh, type TokenSource } from "./gh.ts";

const API = "https://api.github.com";
/** Renew installation tokens this long before GitHub expires them (1 h). */
const RENEW_MS = 5 * 60_000;

export type AppConfig = NonNullable<Config["identity"]["app"]>;

/** Where `kanbot app create` stores the app's private key. Never in the repo. */
export function appKeyPath(appId: number) {
	return join(homedir(), ".kanbot", "apps", `${appId}.pem`);
}

const b64url = (s: string) => Buffer.from(s).toString("base64url");

/** A short-lived JWT that authenticates as the app itself. */
export function appJwt(appId: number, key: string, now = Date.now()) {
	const iat = Math.floor(now / 1000) - 60;
	const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const body = b64url(
		JSON.stringify({ iat, exp: iat + 9 * 60, iss: String(appId) }),
	);
	const sig = createSign("RSA-SHA256")
		.update(`${head}.${body}`)
		.sign(key, "base64url");
	return `${head}.${body}.${sig}`;
}

async function api<T>(
	path: string,
	jwt: string,
	method = "GET",
	body?: unknown,
): Promise<T> {
	const res = await fetch(`${API}${path}`, {
		method,
		headers: {
			accept: "application/vnd.github+json",
			authorization: `Bearer ${jwt}`,
			"x-github-api-version": "2022-11-28",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!res.ok)
		throw new Error(
			`GitHub ${method} ${path} failed (${res.status}): ${await res.text()}`,
		);
	return (await res.json()) as T;
}

/**
 * Installation tokens for one repo, cached until shortly before they expire.
 * Scoped to that repo only.
 */
export function appTokens(app: AppConfig, repo: string): TokenSource {
	const keyFile = appKeyPath(app.id);
	let cached: { token: string; expires: number } | null = null;
	let installation: number | null = null;
	return async () => {
		if (cached && Date.now() < cached.expires - RENEW_MS) return cached.token;
		if (!existsSync(keyFile))
			throw new UserError(`No private key for the kanbot app ${app.slug}.`, {
				why: `Expected it at ${keyFile}.`,
				fix: "Run `kanbot app create`, or copy the key there from the machine that created the app.",
				docs: "identity#app-mode",
			});
		const jwt = appJwt(app.id, await Bun.file(keyFile).text());
		installation ??= await api<{ id: number }>(
			`/repos/${repo}/installation`,
			jwt,
		)
			.then((r) => r.id)
			.catch((e) => {
				throw new UserError(`The kanbot app ${app.slug} can't reach ${repo}.`, {
					why: String(e),
					fix: `Install it on the repo: https://github.com/apps/${app.slug}/installations/new`,
					docs: "identity#app-mode",
				});
			});
		const res = await api<{ token: string; expires_at: string }>(
			`/app/installations/${installation}/access_tokens`,
			jwt,
			"POST",
			{ repositories: [repo.split("/")[1]] },
		);
		cached = { token: res.token, expires: Date.parse(res.expires_at) };
		return res.token;
	};
}

/**
 * The client kanbot talks as: the app in app mode, otherwise the user's own.
 * Commits, pushes, board moves and merges always stay on the user's client.
 */
export function botClient(config: Config, user: Gh): Gh {
	const { mode, app } = config.identity;
	if (mode !== "app") return user;
	if (!app)
		throw new UserError("identity.mode is app, but no app is set.", {
			fix: "kanbot app create",
			docs: "identity#app-mode",
		});
	return new Gh(config.repo, user.dryRun, appTokens(app, config.repo));
}

// ---- manifest flow --------------------------------------------------------------

/** Permissions the app needs to talk on issues and PRs. Nothing else. */
export const APP_PERMISSIONS = {
	issues: "write",
	pull_requests: "write",
	contents: "read",
	metadata: "read",
} as const;

export function appManifest(name: string, redirectUrl: string) {
	return {
		name,
		url: "https://github.com/mikaelbr/kanbot",
		redirect_url: redirectUrl,
		description:
			"kanbot's voice on GitHub: plans, reviews and replies. Commits stay yours.",
		public: false,
		hook_attributes: {
			url: "https://github.com/mikaelbr/kanbot",
			active: false,
		},
		default_permissions: APP_PERMISSIONS,
		default_events: [],
	};
}

export type CreatedApp = { id: number; slug: string; pem: string };

/** Trade the manifest flow's one-time code for the new app's credentials. */
export function convertManifest(code: string): Promise<CreatedApp> {
	return fetch(`${API}/app-manifests/${code}/conversions`, {
		method: "POST",
		headers: { accept: "application/vnd.github+json" },
	}).then(async (res) => {
		if (!res.ok)
			throw new Error(
				`Creating the app failed (${res.status}): ${await res.text()}`,
			);
		return (await res.json()) as CreatedApp;
	});
}
