---

title: CLI usage
description: Every kanbot command and flag.
slug: usage
---

# CLI usage

Run commands from the repository root. `kanbot --help` and `kanbot <command> --help` list the same flags.

## `kanbot init`

Scaffold agents, skills, config and GitHub files into the repo. Also writes `.kanbot/manifest.json` and `.github/CODEOWNERS`, updates `.gitignore` and runs `sync`. Existing files are kept; where kanbot's version differs, it is written next to yours as `<file>.kanbot-new`.

In a terminal, it asks which of your skills fill the `verify`, `review` and `preview` [capabilities](./05-capabilities.md). Pick by number or name, or press Enter to skip.

| Flag                         | Default  | Description                                |
| ---------------------------- | -------- | ------------------------------------------ |
| `--provider <claude\|codex>` | `claude` | Agent provider.                            |
| `--force`                    | `false`  | Overwrite existing files, including edits. |

## `kanbot upgrade`

Update agents, skills and workflows to this kanbot version, keeping your edits. Maps kanbot's old craft skills to capabilities if you have no `capabilities` yet. Runs `sync`. Leaves changes uncommitted. See [Upgrading](./13-upgrading.md).

| Flag        | Default | Description                         |
| ----------- | ------- | ----------------------------------- |
| `--dry-run` | `false` | Show what would change, write none. |

## `kanbot board create`

Create a GitHub Project with the kanbot columns, save it to config and add the repo labels. With `review.copilot`, also adds the Copilot review ruleset. If a project is already set, it only ensures labels and the ruleset. Prints the built-in workflows to enable.

| Flag              | Default   | Description    |
| ----------------- | --------- | -------------- |
| `--title <title>` | repo name | Project title. |

## `kanbot board link`

Use an existing project. Warns about missing columns.

| Flag              | Description                        |
| ----------------- | ---------------------------------- |
| `--owner <login>` | User or org that owns the project. |
| `--number <n>`    | Project number.                    |

## `kanbot app create`

Create a GitHub App for kanbot to talk as, save its key in `~/.kanbot/apps/` and set `identity.mode: app`. Opens GitHub in your browser. See [Identity and merging](./11-identity.md#app-mode).

| Flag            | Default          | Description                 |
| --------------- | ---------------- | --------------------------- |
| `--name <name>` | `kanbot-<owner>` | App name, unique on GitHub. |

## `kanbot app link`

Use an app you already created, e.g. in another repo. Sets `identity` in config.

| Flag            | Description                           |
| --------------- | ------------------------------------- |
| `--id <n>`      | GitHub App ID.                        |
| `--slug <slug>` | App slug, as in github.com/apps/slug. |

## `kanbot sync`

Generate `.claude/agents/`, `.claude/settings.json` and `.codex/agents/` from `.kanbot/agents/`. Also links `.claude/skills` to `.agents/skills`, writes `.kanbot/config.schema.json` and, with `review.copilot`, `.github/copilot-instructions.md`. Run it after editing agents, then commit.

| Flag      | Description                          |
| --------- | ------------------------------------ |
| `--check` | Exit 1 if generated files are stale. |

## `kanbot skills install`

Install the skills that work outside a kanbot repo (`kanbot-idea`, `kanbot-guide`) for your user, in `~/.claude/skills/` and `~/.agents/skills/`. See [Capturing ideas](./03-capturing-ideas.md).

| Flag                               | Default | Description                     |
| ---------------------------------- | ------- | ------------------------------- |
| `--provider <claude\|codex\|both>` | `both`  | Which agent CLI to install for. |

## `kanbot doctor`

Check that everything is in place:

- `gh` auth and scope, and provider login.
- Agents, the skills they use, and capabilities.
- Generated files, config schema and MCP servers for workers.
- Templates up to date, leftover `.kanbot-new` files, and files pushed to the base branch.
- Board columns, board workflows and labels.
- In app mode: the app, its key and its install on the repo.
- With `review.copilot`: the ruleset and `.github/copilot-instructions.md`.

Each failed check says why it matters, how to fix it and, where it helps, a docs link. Lines marked `!` are warnings and don't fail doctor. Exits 1 on failure. Colors turn off when output is piped or `NO_COLOR` is set.

## `kanbot run`

Start the daemon. It polls the board, runs agent jobs and applies their results to GitHub. Stop it with Ctrl-C; running jobs finish first.

| Flag              | Description                              |
| ----------------- | ---------------------------------------- |
| `--once`          | Run one tick, wait for its jobs, exit.   |
| `--dry-run`       | Print what would happen. Change nothing. |
| `-v`, `--verbose` | Verbose logging.                         |

## `kanbot status`

Show the board by column, daemon PID and provider, then what waits on you, oldest first: plans to approve or answer, PRs to review or merge, approaches to pick, and `needs-human` cards with kanbot's reason. Last come local failure counts and any rate-limit pause.

## `kanbot completion`

Print a shell completion script. See [Shell completion](./01-getting-started.md#shell-completion).

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
| `~/.kanbot/apps/`      | Private keys of kanbot apps.           |

The first three are gitignored by `init`.
