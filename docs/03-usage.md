---

title: CLI usage
description: Every kanbot command and flag.
slug: usage
---

# CLI usage

Run commands from the repository root. `kanbot --help` and `kanbot <command> --help` list the same flags.

## `kanbot init`

Scaffold agents, skills, config and GitHub files into the repo. Also writes `.kanbot/manifest.json` and `.github/CODEOWNERS`, updates `.gitignore` and runs `sync`. Existing files are kept; where kanbot's version differs, it is written next to yours as `<file>.kanbot-new`.

| Flag                         | Default  | Description                                |
| ---------------------------- | -------- | ------------------------------------------ |
| `--provider <claude\|codex>` | `claude` | Agent provider.                            |
| `--force`                    | `false`  | Overwrite existing files, including edits. |

## `kanbot upgrade`

Update agents, skills and workflows to this kanbot version, keeping your edits. Runs `sync`. Leaves changes uncommitted. See [Upgrading](./08-upgrading.md).

| Flag        | Default | Description                         |
| ----------- | ------- | ----------------------------------- |
| `--dry-run` | `false` | Show what would change, write none. |

## `kanbot board create`

Create a GitHub Project with the kanbot columns, save it to config and add the repo labels. If a project is already set, it only ensures labels. Prints the built-in workflows to enable.

| Flag              | Default   | Description    |
| ----------------- | --------- | -------------- |
| `--title <title>` | repo name | Project title. |

## `kanbot board link`

Use an existing project. Warns about missing columns.

| Flag              | Description                        |
| ----------------- | ---------------------------------- |
| `--owner <login>` | User or org that owns the project. |
| `--number <n>`    | Project number.                    |

## `kanbot sync`

Generate `.claude/agents/`, `.claude/settings.json` and `.codex/agents/` from `.kanbot/agents/`. Also links `.claude/skills` to `.agents/skills`. Run it after editing agents, then commit.

| Flag      | Description                          |
| --------- | ------------------------------------ |
| `--check` | Exit 1 if generated files are stale. |

## `kanbot skills install`

Install the skills that work outside a kanbot repo (`kanbot-idea`) for your user, in `~/.claude/skills/` and `~/.agents/skills/`. See [Capturing ideas](./09-capturing-ideas.md).

| Flag                               | Default | Description                     |
| ---------------------------------- | ------- | ------------------------------- |
| `--provider <claude\|codex\|both>` | `both`  | Which agent CLI to install for. |

## `kanbot doctor`

Check that everything is in place: `gh` auth and scope, provider login, agents, generated files, templates up to date, leftover `.kanbot-new` files, files pushed to the base branch, board columns, board workflows and labels. Prints a fix for each failed check. Exits 1 on failure.

## `kanbot run`

Start the daemon. It polls the board, runs agent jobs and applies their results to GitHub. Stop it with Ctrl-C; running jobs finish first.

| Flag              | Description                              |
| ----------------- | ---------------------------------------- |
| `--once`          | Run one tick, wait for its jobs, exit.   |
| `--dry-run`       | Print what would happen. Change nothing. |
| `-v`, `--verbose` | Verbose logging.                         |

## `kanbot status`

Show the board by column, daemon PID, provider, `needs-human` issues, local failure counts and any rate-limit pause.

## `kanbot completion`

Print a shell completion script.

| Flag                        | Default  | Description   |
| --------------------------- | -------- | ------------- |
| `--shell <zsh\|bash\|fish>` | `$SHELL` | Target shell. |

## Files written at runtime

| Path                   | What                                   |
| ---------------------- | -------------------------------------- |
| `.kanbot/logs/*.jsonl` | Full transcript of each agent run.     |
| `.kanbot/state.json`   | Failure counts and rate-limit pause.   |
| `.kanbot/daemon.pid`   | Lock so only one daemon runs per repo. |
| `~/.kanbot/worktrees/` | Git worktrees, one per job.            |

The first three are gitignored by `init`.
