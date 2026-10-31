# AGENTS.md

Shared instructions for every coding agent working in this repository (Codex and Claude Code read this file).

## How this repo is operated

This repository is developed by an autonomous agent team driven by kanbot from a GitHub Project board. A daemon polls the board, starts one headless agent per job in its own git worktree, and performs every GitHub side effect itself (comments, issue edits, pushes, pull requests) from the agent's structured output.

Board flow:

1. **Ideas**: raw issues; nothing runs.
2. **Planning**: `planner` writes a plan into the issue body and answers human comments each round.
3. **Ready**: a human approves the plan by moving the card here.
4. **In Progress**: an `implementer-*` agent builds the plan on a branch and commits.
5. **Review**: `reviewer-code`, then `reviewer-spec`, then `fixer` for findings, human review comments, failing CI and merge conflicts.
6. **Done**: a human merges.

## Golden rules

1. **Never touch GitHub.** No `gh`, no `git push`, no `git remote`, no API calls to GitHub. The daemon does all of that from your output. These commands are denied anyway.
2. **Return the structured output.** Column agents must end with the JSON result their schema defines; it is the only way your work reaches GitHub.
3. **Read the `project-conventions` skill first.** It has the commands and conventions for this repo.
4. **Stay in the plan's scope.** The approved plan in the issue is the contract. Work outside it goes in `risks` or as a proposed new issue, not in the diff. For exploratory variants, build only the approach you were given.
5. **Small commits, conventional messages.** `feat(scope): …`, `fix: …`, `test: …`, `refactor: …`, `docs: …`, `build: …`, `ci: …`, `chore: …`. One coherent step per commit. Never rewrite history.
6. **Run tests before finishing.** Narrowest tests while working, then the full suite, lint and typecheck. Never weaken or skip a test to make it pass. Report what you ran.
7. **Leave the worktree clean.** Everything meant for review is committed; no stray files, no running processes.
8. **No secrets** in code, logs, fixtures, screenshots or commit messages.
9. **Write short.** Plans, PR descriptions, replies and findings carry only what a human or agent needs to act or understand. One line per bullet; no restating, no process narration.

## Where things live

- `.kanbot/agents/*.md`: agent definitions (frontmatter + instructions). This is the source of truth.
- `.agents/skills/<name>/SKILL.md`: skills shared by all agents. `.claude/skills` is a symlink to it.
- `.claude/agents/`, `.claude/settings.json` and `.codex/agents/` are **generated** from `.kanbot/agents` by `kanbot sync`. Do not edit them by hand; edit the source and run `kanbot sync`.
- `.kanbot/screenshots/<branch>/`: UI screenshots committed for review.

## When working interactively

The same agents and skills work in a normal Claude Code or Codex session. The rules above still apply: a human pushes and opens PRs, not the agent, unless the human explicitly does it themselves.
