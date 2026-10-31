import { expect, test } from "bun:test";
import { describeError, formatError, UserError } from "../src/errors.ts";

test("user errors show what, why, fix, docs and more", () => {
	const e = new UserError("Not set up.", {
		why: "No config.",
		fix: "kanbot init",
		docs: "getting-started",
	});
	expect(formatError(e)).toBe(
		[
			"✖ Not set up.",
			"",
			"  No config.",
			"",
			"  Fix:  kanbot init",
			"  Docs: https://kanbot.mib.im/getting-started",
			"  More: Run `kanbot doctor` to check your setup.",
		].join("\n"),
	);
});

test("missing executables get an install fix and keep the raw error", () => {
	const d = describeError(new Error('Executable not found in $PATH: "gh"'));
	expect(d.message).toBe("`gh` is not installed or not on PATH.");
	expect(d.why).toContain("Executable not found");
	expect(d.fix).toContain("https://cli.github.com");
});

test("gh auth and scope failures get a fix", () => {
	const auth = describeError(
		new Error("gh: To get started, run: gh auth login"),
	);
	expect(auth.fix).toBe("gh auth login");
	expect(auth.why).toContain("To get started");
	expect(
		describeError(new Error("GraphQL: INSUFFICIENT_SCOPES")).fix,
	).toContain("-s project");
});

test("other gh failures show the gh output", () => {
	const d = describeError(new Error("gh issue list --repo failed (1): boom"));
	expect(d.message).toBe("A `gh` command failed.");
	expect(d.why).toContain("boom");
});

test("argument errors point at the command's help", () => {
	const e = Object.assign(new Error("Invalid value for --shell"), {
		name: "CLIError",
		code: "EARG",
	});
	expect(describeError(e, "completion").fix).toContain(
		"kanbot completion --help",
	);
});

test("unknown errors point at KANBOT_DEBUG and issues; debug shows the stack", () => {
	const e = new Error("boom");
	expect(formatError(e)).toContain("KANBOT_DEBUG=1");
	expect(formatError(e)).toContain("/issues");
	expect(formatError(e, { debug: true })).toContain("at ");
});
