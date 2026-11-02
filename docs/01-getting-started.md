---

title: Getting started
description: Install kanbot and set it up in a repository.
slug: getting-started
---

# Getting started

## Requirements

- [Bun](https://bun.sh) 1.3 or newer.
- [`gh`](https://cli.github.com) logged in, with the `project` scope.
- [`claude`](https://docs.claude.com/en/docs/claude-code) or [`codex`](https://github.com/openai/codex) logged in with a subscription. See [Providers](./11-providers.md).
- A GitHub repository you can push to.

Add the `project` scope to your `gh` token:

```sh
gh auth refresh -s project
```

## Install

Run it without installing:

```sh
bunx kanbot <command>
```

Or install it globally:

```sh
bun add -g kanbot
```

## Set up a repository

For a guided setup, run `bunx kanbot skills install`, then ask your agent "help me set up kanbot in this repo". The `kanbot-guide` skill walks you through the steps below and helps you choose options.

```sh
cd your-repo
kanbot init --provider claude   # or codex
```

In a terminal, `init` asks which of your skills to use for verifying, reviewing and previewing changes. Press Enter to skip. See [Capabilities](./05-capabilities.md).

`init` adds, among others:

| Path                       | What                                                |
| -------------------------- | --------------------------------------------------- |
| `.kanbot/config.yml`       | Config. See [Configuration](./10-configuration.md). |
| `.kanbot/agents/*.md`      | Agent definitions. See [Agents](./06-agents.md).    |
| `.agents/skills/`          | Shared skills. See [Skills](./07-skills.md).        |
| `.claude/`, `.codex/`      | Generated from `.kanbot/agents`. Don't edit.        |
| `AGENTS.md`, `CLAUDE.md`   | Rules every agent follows.                          |
| `.github/workflows/ci.yml` | CI. Agents fix failing CI, so adjust it.            |

Existing files are kept. Where kanbot's version differs, it is written next to yours as `<file>.kanbot-new`. Pass `--force` to overwrite them. [`kanbot init`](./15-usage.md#kanbot-init) lists the rest.

## Fill in project conventions

Fill in `.agents/skills/project-conventions/SKILL.md` with your stack, commands and rules. Every agent reads it first. Ask your agent to draft it, then check each command. See [Project conventions](./08-project-conventions.md).

Also review `AGENTS.md` and `.github/workflows/ci.yml`.

## Create the board

```sh
kanbot board create
```

This creates a GitHub Project with the six columns and adds the labels. To use an existing project instead:

```sh
kanbot board link --owner <login> --number <n>
```

Then enable these built-in workflows in the project (Project → ⋯ → Workflows). They can't be set through the API:

- **Item closed** → Status: Done
- **Pull request merged** → Status: Done
- **Auto-add to project** → filter `is:issue repo:<owner>/<repo>`
- **Item added to project** → Status: Ideas

## Commit and push

Agents work in worktrees made from the base branch, so the kanbot files must be pushed:

```sh
git add -A && git commit -m "chore: add kanbot" && git push
```

## Check and run

```sh
kanbot doctor                # checks auth, board, labels and generated files
kanbot run --once --dry-run  # shows what it would do
kanbot run                   # starts the daemon
```

Run one daemon per repo. Next, read the [development flow](./02-workflow.md). To have kanbot talk as its own bot, so you can approve its PRs, see [Identity and merging](./12-identity.md).

## Shell completion

```sh
echo 'source <(kanbot completion)' >> ~/.zshrc     # or ~/.bashrc
kanbot completion --shell fish > ~/.config/fish/completions/kanbot.fish
```

For zsh, `compinit` must run first.
