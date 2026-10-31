---

title: Getting started
description: Install kanbot and set it up in a repository.
slug: getting-started
---

# Getting started

## Requirements

- [Bun](https://bun.sh) 1.3 or newer.
- [`gh`](https://cli.github.com) logged in, with the `project` scope.
- [`claude`](https://docs.claude.com/en/docs/claude-code) or [`codex`](https://github.com/openai/codex) logged in with a subscription. See [Providers](./04-providers.md).
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

```sh
cd your-repo
kanbot init --provider claude   # or codex
```

`init` adds:

| Path                                  | What                                                   |
| ------------------------------------- | ------------------------------------------------------ |
| `.kanbot/config.yml`                  | Config. See [Configuration](./07-configuration.md).    |
| `.kanbot/agents/*.md`                 | Agent definitions. See [Agents](./05-agents.md).       |
| `.agents/skills/`                     | Shared skills. See [Skills](./06-skills.md).           |
| `.claude/`, `.codex/`                 | Generated from `.kanbot/agents`. Don't edit.           |
| `AGENTS.md`, `CLAUDE.md`              | Rules every agent follows.                             |
| `.github/ISSUE_TEMPLATE/`             | User story and technical issue templates.              |
| `.github/workflows/ci.yml`            | CI. Agents fix failing CI, so adjust it to your stack. |
| `.github/workflows/kanbot-merged.yml` | Closes sibling PRs when one exploratory PR is merged.  |
| `.github/CODEOWNERS`                  | You, as owner.                                         |

Existing files are kept. Pass `--force` to overwrite them.

## Fill in project conventions

Edit `.agents/skills/project-conventions/SKILL.md`. Add your stack, commands and conventions. Every agent reads it first, so wrong commands here cause wrong work everywhere.

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

Run one daemon per repo. Next, read the [development flow](./02-workflow.md).

## Shell completion

```sh
echo 'source <(kanbot completion)' >> ~/.zshrc     # or ~/.bashrc
kanbot completion --shell fish > ~/.config/fish/completions/kanbot.fish
```

For zsh, `compinit` must run first.
