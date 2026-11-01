---

title: Copilot review
description: Add GitHub Copilot as a third reviewer that runs in the cloud.
slug: copilot-review
---

# Copilot review

kanbot's own reviewers run on your machine. You can add GitHub Copilot code review as a third reviewer. It runs on GitHub, and its comments are fixed by kanbot's `fixer` like any other finding.

It's off by default, because it costs money: Copilot code review needs a paid Copilot plan, and each review uses credits.

## Why add it

- **A second opinion.** A different model, with different blind spots.
- **Reviews without your laptop.** GitHub requests the review as soon as a PR opens, whether or not the daemon is running. The daemon picks up the comments when it's back.
- **The same rules.** Copilot is pointed at the skills your kanbot reviewers already use.

## Turn it on

1. In `.kanbot/config.yml`:

   ```yaml
   review:
     copilot: true
   ```

2. Run `kanbot board create`. With a board already set, it only adds what's missing, here a branch ruleset named **kanbot: Copilot review**. The ruleset asks Copilot to review every PR to the default branch.
3. Run `kanbot sync`. It writes `.github/copilot-instructions.md`, which tells Copilot to use the `review-findings` rubric, your `review` capability if mapped, `AGENTS.md`, `project-conventions` and `project-memory`.
4. Commit, push, and restart the daemon.
5. Run `kanbot doctor` to check the ruleset and the instructions file.

To turn it off, set `copilot: false`, run `kanbot sync` (it removes the instructions file) and delete the ruleset in the repo's settings.

## Where it fits in Review

After both kanbot review passes, the daemon checks Copilot:

1. **Copilot left comments.** The `fixer` answers every unresolved Copilot thread: it fixes real problems and replies with a reason where Copilot is wrong. Copilot's comments rank like agent findings, so they never override the plan or your decisions.
2. **No Copilot review yet.** The daemon waits, up to `copilotWaitMinutes` (15) after the PR opened.
3. **Still nothing after the wait.** The PR gets `agent-reviewed` without it. Copilot may be out of credits or switched off.

Your own comments still come first, as always.

## Options

| Option                      | Default | What it does                                                               |
| --------------------------- | ------- | -------------------------------------------------------------------------- |
| `review.copilot`            | `false` | Wait for Copilot and fix its comments.                                     |
| `review.copilotOnPush`      | `false` | Review again after every push. The fixer pushes often, so this costs more. |
| `review.copilotWaitMinutes` | `15`    | How long to wait for the first review.                                     |

Rerun `kanbot board create` after changing `copilotOnPush`, so the ruleset matches.

## Good to know

- Copilot reviews every PR the ruleset covers, including PRs you open yourself. kanbot only acts on Copilot comments on its own PRs and on PRs labeled [`kanbot-review`](./04-outside-the-board.md#your-own-prs-the-kanbot-review-label).
- Copilot reads `AGENTS.md` and `.github/copilot-instructions.md` from the PR branch. Whether it also reads `.agents/skills/` directly isn't documented, which is why the instructions file points at the skills by path.
- Copilot's review is a comment, never an approval. You still merge.
