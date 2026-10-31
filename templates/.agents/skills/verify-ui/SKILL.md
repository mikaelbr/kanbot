---

name: verify-ui
description: Run the app and use Playwright to screenshot key UI states at 390px and 1280px, save them under .kanbot/screenshots/<branch>/, and check console errors. Use after implementing or fixing a UI change, when reviewing a UI PR, or when asked to verify, screenshot or visually check the app. Degrades gracefully when there is no UI or dev server.
---

# Verify UI

Screenshots are how a human reviewer sees the change without checking out the branch. Capture every state the plan's design notes list, at mobile and desktop width, and look at them yourself before anyone else does.

## 1. Decide if this applies

Skip with a note in `risks` ("no UI to verify") when the change has no visual effect. If there is a UI but no way to run it (no dev script, needs secrets or external services you do not have), say exactly what is missing and rely on component tests.

## 2. Start the app

1. Get the dev command, port and required env from `project-conventions` (or `package.json` scripts: `dev`, `start`, `preview`).
2. Install dependencies if `node_modules` is missing, with the project's package manager.
3. Start it in the background, logging to a file, and wait until it responds:

```bash
(bun run dev > "$TMPDIR/kanbot-dev.log" 2>&1 &)
for i in $(seq 1 60); do curl -sf http://localhost:5173 >/dev/null && break; sleep 1; done
```

4. If it does not come up within ~60s, read the log, make one reasonable fix attempt (missing env default, seed step), then give up and report.

## 3. Get Playwright

Prefer the project's own Playwright if it has one (`@playwright/test` in devDependencies, a `playwright.config.*`). Otherwise use it ad hoc without adding a dependency:

```bash
bunx playwright --version || npx -y playwright --version
bunx playwright install chromium   # once; may be unavailable offline
```

Do not add Playwright to the project's dependencies unless the plan asks for it.

## 4. Capture states

Write a throwaway script outside the repository (e.g. `$TMPDIR/kanbot-shots.mjs`):

```js
import { chromium } from "playwright";
const [base, outDir] = process.argv.slice(2);
const states = [
	{ name: "filled", path: "/month", setup: async (page) => {} },
	{ name: "empty", path: "/month?fixture=empty", setup: async (page) => {} },
	// reach error/dialog states via setup: route interception, clicks, etc.
];
const browser = await chromium.launch();
const problems = [];
for (const width of [390, 1280]) {
	const page = await browser.newPage({
		viewport: { width, height: width === 390 ? 844 : 800 },
	});
	page.on(
		"console",
		(m) =>
			["error", "warning"].includes(m.type()) &&
			problems.push(`${width} ${m.type()}: ${m.text()}`),
	);
	page.on("pageerror", (e) =>
		problems.push(`${width} pageerror: ${e.message}`),
	);
	for (const s of states) {
		await page.goto(base + s.path, { waitUntil: "networkidle" });
		await s.setup(page);
		await page.evaluate(() => document.fonts.ready);
		await page.screenshot({
			path: `${outDir}/${s.name}-${width}.png`,
			fullPage: true,
		});
	}
	await page.close();
}
await browser.close();
console.log(problems.join("\n") || "no console problems");
```

Run it with `node`/`bun` from a directory where `playwright` resolves. Use `page.route()` to simulate error and loading states instead of breaking the app.

## 5. Where to save

- Implementers and fixers: `.kanbot/screenshots/<branch>/<state>-<width>.png`, committed (`chore: add screenshots for review`). Replace old screenshots of the same state rather than accumulating them.
- Reviewers: a temp directory outside the repo. Reviewers never commit.
- List the committed paths in the `screenshots` output field and embed them in the PR body.

## 6. Look at them

Open each screenshot and check:

- [ ] Nothing overflows or forces horizontal scroll at 390px
- [ ] No clipped, overlapping or truncated text that hides meaning
- [ ] Alignment and spacing consistent with surrounding UI
- [ ] Contrast readable; focus visible where captured
- [ ] Empty, error and loading states look intentional, not broken
- [ ] No console errors or uncaught exceptions attributable to the change

Fix what you find, recapture, then report.

## 7. Clean up

Stop the dev server (`pkill -f "<dev command>"` or kill the PID you started) and delete the throwaway script. Leave no running processes behind.
