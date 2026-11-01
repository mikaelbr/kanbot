import { expect, test } from "bun:test";
import { REPO_LABELS } from "../src/commands/board.ts";

test("board creates no type:* labels", () => {
	expect(
		REPO_LABELS.map(([n]) => n).filter((n) => n.startsWith("type:")),
	).toEqual([]);
	expect(REPO_LABELS.map(([n]) => n)).toContain("technical");
});
