---

name: kanbot-guide
description: Explain kanbot and guide a human through it. Use when someone asks what kanbot is, how to set it up in a repo, which config options to pick (provider, bot or user identity, merge on approval, Copilot, notifications), how the board flow works, where something is documented, or why something isn't working. Works before kanbot is installed in the repo. For changing agents, skills or upgrading, use kanbot-admin.
---

# kanbot guide

You are helping a human understand and set up kanbot: a daemon that runs a team of Claude Code or Codex agents from a GitHub Project board. They write and prioritize issues; agents plan, build, review and fix; they approve plans and merge.

Explain in plain words. Ask before choosing for them; give a recommendation with one line of why. Docs live at https://kanbot.mib.im/<slug>. Link the page instead of repeating it.

## Docs

| Question                                      | Slug                  |
| --------------------------------------------- | --------------------- |
| How do I install and set up a repo?           | `getting-started`     |
| How does a card move across the board?        | `workflow`            |
| How do I add or file ideas?                   | `capturing-ideas`     |
| My own PRs, local sessions, direct commits?   | `outside-the-board`   |
| Which agents are there, how do I change them? | `agents`              |
| Skills?                                       | `skills`              |
| Filling in stack, commands and rules          | `project-conventions` |
| Project memory, facts from corrections        | `project-memory`      |
| Claude or Codex?                              | `providers`           |
| Every config field, labels, notifications     | `configuration`       |
| Using our own skills and agents for the work  | `capabilities`        |
| Copilot as an extra reviewer                  | `copilot-review`      |
| Bot or user identity, merge by approving      | `identity`            |
| Upgrading and `.kanbot-new` files             | `upgrading`           |
| Every command and flag                        | `usage`               |

## Board flow

Ideas (you write) → Planning (agent plans, you comment) → Ready (you approve by moving the card) → In Progress (agent builds, opens a PR) → Review (technical, then acceptance review, with fixes; you comment) → Done (you merge, or approve and kanbot merges).

kanbot runs the process; the repo's own skills and agents do the work on code, through capabilities. Plans list assumptions about user need; open questions and open "blocked by" issues keep a card from starting in Ready.

Agents never get a GitHub token. The daemon does every comment, push and PR. Only collaborators with write access can steer agents. Workers see only what's committed, including MCP servers in `.mcp.json`; never the user's own plugins or servers.

## Guided setup

Go step by step. Run each command, check its output, then go on. If `.kanbot/config.yml` exists, run `kanbot doctor` first and skip what passes.

1. **Requirements.** Bun 1.3+, `gh` logged in, `claude` or `codex` logged in with a subscription (not an API key). Run `gh auth refresh -s project`.
2. **Init.** Best: have them run `bunx kanbot init` in their own terminal. It asks for provider, identity, options, capabilities and the board. Without a terminal, ask which subscription they have and run `bunx kanbot init --yes --provider claude|codex`; then go on with the steps below.
3. **Conventions.** Fill in `.agents/skills/project-conventions/SKILL.md` with them: stack, commands to test, lint and typecheck. Adjust `.github/workflows/ci.yml` to run the same. Every agent reads this first. Draft it from manifests and CI, ask what you can't find, and have them run each command. Link `project-conventions`.
4. **Capabilities.** kanbot runs the process; the repo's own skills and agents do the work. Ask which skills they have for proving acceptance criteria (`verify`), technical review (`review`) and something a human can try (`preview`), and map them under `capabilities` in `.kanbot/config.yml`. See [Capabilities](#capabilities).
5. **Board.** Skip if `init` made one. Otherwise `kanbot board create`, or `kanbot board link --owner <login> --number <n>` for an existing project. Have them enable the four built-in project workflows it prints; they can't be set through the API.
6. **Options.** Skip what `init` asked. Otherwise go through [Choose options](#choose-options). For app mode, run `kanbot app create` and have them install the app on the repo.
7. **Commit and push** the kanbot files. Agents only see what's on the pushed base branch.
8. **Check.** `kanbot doctor` until it passes, then `kanbot doctor --probe` once to try a real agent job, then `kanbot run --once --dry-run`, then `kanbot run`.
9. **First card.** Have them write an issue, put it in Planning and read the plan. Point to `workflow`.

## Capabilities

```yaml
capabilities:
  verify: { use: e2e-tests, when: Changes users see }
  preview: { use: deploy-preview, required: true }
  review: code-review # bare name: no when, not required
```

- `use`: a skill in `.agents/skills` or an agent in `.kanbot/agents`. `when`: when it applies. `required: true`: a miss blocks acceptance review.
- Any other name is theirs (`benchmark`, `security`…). Unmapped needs are left to the agent.
- Suggest, don't install: no `verify` → a skill that runs the app or end-to-end tests; no `preview` → a preview deploy or test build; no `review` → a review skill with their checklist. `kanbot doctor` names what's not mapped.

## Choose options

Ask only about what matters to them. Defaults are fine for the rest. Options live in `.kanbot/config.yml`; the daemon reloads them once pushed.

| Option                             | Ask                                                                  | Recommend                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `identity.mode` (`user` \| `app`)  | Should kanbot talk as you, or as its own bot?                        | `app`: clear who said what, GitHub notifies you, and you can approve its PRs. `user` for zero setup. Commits are yours in both. |
| `merge.onApproval`, `merge.method` | Merge by approving the PR, or press merge yourself?                  | `true` with `app` mode. In `user` mode only another collaborator can approve.                                                   |
| `provider`                         | Claude or ChatGPT subscription?                                      | Whichever they pay for.                                                                                                         |
| `concurrency`                      | How many agents at once?                                             | Default 3. Lower on a small machine or near usage limits.                                                                       |
| `wip.awaitingHuman`                | How many items can wait on you before agents stop starting new work? | 5 for a solo builder. Off (`null`) by default. Optional: same limit on the board's Review column (column menu → Set limit).     |
| `review.copilot`                   | Want GitHub Copilot as an extra reviewer? (costs credits)            | Off unless they have a paid Copilot plan.                                                                                       |
| `notify.desktop`, `notify.webhook` | Where do you want to hear that a PR is ready?                        | Desktop. Add an ntfy.sh webhook for phone alerts.                                                                               |
| `explore:N` label                  | Want several approaches built for some issues?                       | Per issue, not config.                                                                                                          |

### Who does what

| Action                                    | `user` mode            | `app` mode   |
| ----------------------------------------- | ---------------------- | ------------ |
| Comments, PRs, labels, issue and PR edits | User, `🤖 kanbot` line | `<app>[bot]` |
| Commits, pushes, merges, board moves      | User                   | User         |

Board moves stay on the user's account: GitHub Apps can't use boards owned by a personal account.

### App mode

- `kanbot app create` opens GitHub; they click **Create GitHub App**, then install it on the repo. The key goes in `~/.kanbot/apps/<id>.pem`; never commit it.
- Same app in another repo: `kanbot app link --id <id> --slug <slug>`, then add the repo to the app's installation.
- Back to user mode: `identity.mode: user`.

### Merge on approval

kanbot merges, as the user, only `kanbot/*` PRs that are agent-reviewed, approved on the latest commit by a collaborator, with no open change request, passing checks, no conflicts and no `needs-human`. A push after approval needs a new approval.

Warn: never enable the branch rule "Require approval of the most recent reviewable push". The user's account pushes kanbot's commits, so it blocks their own approval.

## Troubleshoot

1. `kanbot doctor`: prints a fix for each failed check. `--probe` runs a short agent job to check it can edit files, write skills and commit.
2. `kanbot status`: board by column, running agents and their permission or provider errors, what waits on the user (oldest first), daemon, failures, rate-limit pause. `-f` follows a running agent.
3. `kanbot report`: merged PRs, cycle time, wait on the user, fix loops and `needs-human` causes for the last 7 days. `--post` adds it to the board's Status updates.
4. `kanbot logs`: recent agent runs and how they ended. `kanbot logs <key|#issue|prN>` shows a transcript; `-f` follows it live.
5. `needs-human` label: the issue has a comment saying why. Fix the cause, then remove the label to retry.
6. Nothing happens: is the daemon running, are kanbot files pushed to the base branch, is the card in an active column?
7. Card stays in Ready: the plan has open questions, or the issue is blocked by open issues. kanbot commented why. Answer questions in Planning; blocked cards start when the blockers close.
8. Agent didn't use a skill: is it mapped under `capabilities`, does its `when` fit, and is it committed?
