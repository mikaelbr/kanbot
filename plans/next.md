# Next: off-board work, upgrades, memory, idea capture, cloud review

Decisions from the 2026-10-31 grilling session. Work top-down; one commit per item on branch `next`. Every item updates `docs/` in the same change: explain what it is, why it exists, and how to use it, for someone new to kanbot.

## Principles

- GitHub stays the only runtime state. Repo files hold knowledge, not daemon state.
- Solo or small trusted team. Reuse existing GitHub access; no custom MCP server.
- Ideas land in **Ideas**. The human gate is unchanged.

## Work list

### 1. Conflict fix

- [x] Fetch `mergeable` per PR.
- [x] `CONFLICTING` kanbot PR in Review → fixer merges `origin/<base>` and resolves conflicts. No rebase.
- [x] Max 3 attempts, then `needs-human` (same as CI).
- [x] Docs: Review steps in `02-workflow.md`.

### 2. `kanbot upgrade` and manifest

- [x] Three file classes, declared in `src/templates.ts`: kanbot-owned (always overwrite), user-owned (write once), shared (update if unmodified, else flag).
- [x] `init` writes committed `.kanbot/manifest.json`: kanbot version + template hash per file.
- [x] Ship template hashes of all past versions in git history (`bun run hashes`) so manifest-less installs bootstrap.
- [x] `upgrade` runs locally, leaves changes uncommitted. Conflicts write `<file>.kanbot-new`. Prints a short changelog.
- [x] `doctor` warns when the repo is behind the installed version.
- [x] Docs: new "Upgrading" page.

### 3. `kanbot-admin` skill

- [x] One skill in `.agents/skills/`, for interactive human sessions only. No board agent lists it.
- [x] Covers: add/edit agents and skills, `kanbot sync`, config, running upgrades, merging `.kanbot-new` files, adding memory (memory part lands with item 4).
- [x] Docs: skills page.

### 4. Project memory

- [x] `project-memory` skill (user-owned): `SKILL.md` index + one file per fact.
- [x] Every board agent lists it.
- [x] Agents add a fact in their PR only when human feedback revealed something durable. Merge is the gate.
- [x] Agents fix or delete facts the code contradicts. Reviewers flag stale facts.
- [x] Docs: memory section, how it differs from `project-conventions`.

### 5. `kanbot-idea` skill

- [x] Interviews the user, checks for duplicate issues, writes a user-story or technical issue (adds `technical` label), relies on the board's auto-add to put it in **Ideas**. Moving to Planning stays a drag by the human. Leaves `type:*` to the planner.
- [x] Works through `gh` or the GitHub MCP server.
- [x] In-repo copy plus `kanbot skills install` (`~/.claude/skills`, Codex equivalent). Outside a repo, target board from argument or asked.
- [x] Docs: "Capturing ideas" incl. phone fallback (GitHub Mobile + issue templates + auto-add).

### 6. Copilot review

- [ ] Spike (manual, needs a paid plan): does Copilot code review read `.agents/skills/`? If not, mirror to `.github/skills/`. Also confirm the `copilot_code_review` ruleset rule type.
- [x] `kanbot sync` generates `.github/copilot-instructions.md` pointing at `code-review` and `AGENTS.md`.
- [x] Config `review.copilot` (default off). `board create`/`doctor` set up the ruleset. Re-review on push off by default (`review.copilotOnPush`).
- [x] Review waits for `copilot-pull-request-reviewer[bot]` up to ~15 min, then proceeds.
- [x] Copilot comments are agent findings for the fixer; they don't outrank the plan.
- [x] Docs: cost note, setup, how it fits the review order.

### 7. `kanbot-review` label

- [ ] Non-kanbot PRs with `kanbot-review` get code review + fixer. PR body is the spec. No card.
- [ ] Docs: "Working outside the board" (local sessions, manual PRs, direct commits).

## Out of scope

Daemon hosting off the laptop, kanbot MCP server, post-merge learner job, running kanbot reviews in a GitHub Action, retroactive cards for off-board work.
