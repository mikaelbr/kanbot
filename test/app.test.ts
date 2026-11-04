import { expect, test } from "bun:test";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { SIGNATURE, signed } from "../src/github/api.ts";
import { appJwt, appManifest } from "../src/github/app.ts";
import { Gh } from "../src/github/gh.ts";

test("app JWT is RS256-signed with the app id as issuer", () => {
	const { privateKey, publicKey } = generateKeyPairSync("rsa", {
		modulusLength: 2048,
	});
	const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
	const now = Date.parse("2026-11-01T00:00:00Z");
	const jwt = appJwt(42, pem, now);
	const [head, body, sig] = jwt.split(".") as [string, string, string];
	expect(
		createVerify("RSA-SHA256")
			.update(`${head}.${body}`)
			.verify(publicKey, sig, "base64url"),
	).toBe(true);
	const claims = JSON.parse(Buffer.from(body, "base64url").toString());
	expect(claims.iss).toBe("42");
	expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
	expect(claims.iat).toBeLessThan(now / 1000);
});

test("manifest asks only for what kanbot needs to talk and read CI", () => {
	const m = appManifest("kanbot-acme", "http://localhost:1/callback");
	expect(m.default_permissions).toEqual({
		issues: "write",
		pull_requests: "write",
		contents: "read",
		metadata: "read",
		checks: "read",
		statuses: "read",
	});
	expect(m.public).toBe(false);
});

test("comments are signed only when posting as the user", () => {
	const user = new Gh("acme/app");
	const bot = new Gh("acme/app", false, async () => "t");
	expect(signed(user, "hi")).toBe(`${SIGNATURE}\n\nhi`);
	expect(signed(bot, "hi")).toBe("hi");
});
