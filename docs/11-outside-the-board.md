---

title: Working outside the board
description: Local agent sessions, your own PRs and direct commits, alongside kanbot.
slug: outside-the-board
---

# Working outside the board

The board is for work you want agents to own, from plan to PR. Not everything fits that. Sometimes you fix a typo straight on `main`, pair with an agent in your editor, or open a PR yourself. kanbot is built to live alongside that.

## Agent sessions in your repo

The agents and skills kanbot installs also work in normal Claude Code and Codex sessions. `kanbot sync` writes them in each tool's native format. So when you work locally, your agent:

- follows the same `AGENTS.md`, `project-conventions` and `project-memory`,
- can call the same subagents, such as `explorer` and `test-writer`,
- can file new ideas for the board with [`kanbot-idea`](./09-capturing-ideas.md),
- can maintain the kanbot setup with [`kanbot-admin`](./06-skills.md#kanbot-admin).

Work done this way doesn't need a card. The board shows what you want agents to do, and git history shows what happened.

## Your own PRs: the `kanbot-review` label

Want agent review on a PR you opened yourself? Add the `kanbot-review` label. You don't need a card.

The daemon then treats it like a kanbot PR in Review, with three differences:

- **The PR description is the spec.** There is no plan, so only `reviewer-code` runs. The spec review is skipped.
- **Your comments are instructions.** Comments and review threads from collaborators go to the `fixer`, which pushes commits to your branch.
- **No card moves.** When review is done, the PR gets `agent-reviewed` and you're notified.

Failing CI and merge conflicts are fixed too, as on kanbot PRs. Remove the label to stop. PRs from forks are skipped, because kanbot can't push to them.

## Commits straight to the base branch

Push to `main` whenever you like. If that makes an open kanbot PR conflict, the `fixer` merges `main` into the PR and resolves the conflicts. It never rebases, so the PR's history stays intact. After 3 failed attempts, the issue gets `needs-human`.

Cards in Planning or Ready need nothing: agents always start from the latest base branch.

## When to use what

| You want to…                                | Do this                                                         |
| ------------------------------------------- | --------------------------------------------------------------- |
| Hand off a whole piece of work              | Card on the board                                               |
| Get a quick fix in                          | Commit or PR yourself                                           |
| Get agent review on your own PR             | Add `kanbot-review`                                             |
| Work with an agent at your side             | Normal Claude Code or Codex session in the repo                 |
| Note an idea for later while working        | Ask your agent to file it (`kanbot-idea`)                       |
| Teach agents something for every future job | Add a fact to [`project-memory`](./06-skills.md#project-memory) |
