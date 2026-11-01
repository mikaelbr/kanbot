import { expect, test } from "bun:test";
import { age } from "../src/commands/status.ts";

test("age is short", () => {
	const now = Date.parse("2026-10-10T12:00:00Z");
	expect(age("2026-10-10T11:55:00Z", now)).toBe("5m");
	expect(age("2026-10-10T09:00:00Z", now)).toBe("3h");
	expect(age("2026-10-08T12:00:00Z", now)).toBe("2d");
	expect(age("2026-10-11T00:00:00Z", now)).toBe("0m");
});
