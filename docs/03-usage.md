---

title: CLI usage
description: Every autogh command and flag.
slug: usage
---

# CLI usage

Run commands from the repository root. `autogh --help` and `autogh <command> --help` list the same flags.

## `autogh init`

Scaffold agents, skills, config and GitHub files into the repo. Also writes `.github/CODEOWNERS`, updates `.gitignore` and runs `sync`.

| Flag                         | Default  | Description               |
| ---------------------------- | -------- | ------------------------- |
| `--provider <claude\|codex>` | `claude` | Agent provider.           |
| `--force`                    | `false`  | Overwrite existing files. |

## `autogh board create`

Create a GitHub Project with the autogh columns, save it to config and add the repo labels. If a project is already set, it only ensures labels. Prints the built-in workflows to enable.

| Flag              | Default   | Description    |
| ----------------- | --------- | -------------- |
| `--title <title>` | repo name | Project title. |

## `autogh board link`

Use an existing project. Warns about missing columns.

| Flag              | Description                        |
| ----------------- | ---------------------------------- |
| `--owner <login>` | User or org that owns the project. |
| `--number <n>`    | Project number.                    |

## `autogh sync`

Generate `.claude/agents/`, `.claude/settings.json` and `.codex/agents/` from `.autogh/agents/`. Also links `.claude/skills` to `.agents/skills`. Run it after editing agents, then commit.

| Flag      | Description                          |
| --------- | ------------------------------------ |
| `--check` | Exit 1 if generated files are stale. |

## `autogh doctor`

Check that everything is in place: `gh` auth and scope, provider login, agents, generated files, files pushed to the base branch, board columns, board workflows and labels. Prints a fix for each failed check. Exits 1 on failure.

## `autogh run`

Start the daemon. It polls the board, runs agent jobs and applies their results to GitHub. Stop it with Ctrl-C; running jobs finish first.

| Flag              | Description                              |
| ----------------- | ---------------------------------------- |
| `--once`          | Run one tick, wait for its jobs, exit.   |
| `--dry-run`       | Print what would happen. Change nothing. |
| `-v`, `--verbose` | Verbose logging.                         |

## `autogh status`

Show the board by column, daemon PID, provider, `needs-human` issues, local failure counts and any rate-limit pause.

## `autogh completion`

Print a shell completion script.

| Flag                        | Default  | Description   |
| --------------------------- | -------- | ------------- |
| `--shell <zsh\|bash\|fish>` | `$SHELL` | Target shell. |

## Files written at runtime

| Path                   | What                                   |
| ---------------------- | -------------------------------------- |
| `.autogh/logs/*.jsonl` | Full transcript of each agent run.     |
| `.autogh/state.json`   | Failure counts and rate-limit pause.   |
| `.autogh/daemon.pid`   | Lock so only one daemon runs per repo. |
| `~/.autogh/worktrees/` | Git worktrees, one per job.            |

The first three are gitignored by `init`.
