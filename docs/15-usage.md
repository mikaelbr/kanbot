---

title: CLI usage
description: Every kanbot command and flag.
slug: usage
---

# CLI usage

Run commands from the repository root. `kanbot --help` and `kanbot <command> --help` list the same flags.

## `kanbot init`

Set up kanbot in the repo. Adds agents, skills, config and GitHub files, writes `.kanbot/manifest.json` and `.github/CODEOWNERS`, updates `.gitignore` and runs `sync`. Existing files are kept; where kanbot's version differs, it is written next to yours as `<file>.kanbot-new`.

In a terminal, it walks you through setup. Press Enter to take the default:

1. **Provider**: Claude Code or Codex. Defaults to the one you're logged in to.
2. **GitHub identity**: talk as you, or as its own bot (runs [`kanbot app create`](#kanbot-app-create)). Then whether to merge PRs on approval. See [Identity](./12-identity.md).
3. **Options**: agents at once, limit on items waiting for you, phone alerts, Copilot review. Defaults are shown; change them or keep them.
4. **Capabilities**: which of your skills fill `verify`, `review` and `preview`. Asked only if you have your own skills. See [Capabilities](./05-capabilities.md).
5. **Board**: create one, link an existing one by URL, or skip. Adds the `project` scope to `gh` if needed, and offers to open the page where you turn on the board's workflows.

Run again, it updates files and asks only about what isn't set up, like a missing board. Without a terminal, or with `--yes`, it asks nothing and uses defaults.

| Flag                         | Default | Description                                         |
| ---------------------------- | ------- | --------------------------------------------------- |
| `--provider <claude\|codex>` | ask     | Agent provider. `claude` when not asking.           |
| `--yes`                      | `false` | Don't ask; use defaults and set up the board later. |
| `--force`                    | `false` | Overwrite existing files, including edits.          |

## `kanbot upgrade`

Update agents, skills and workflows to this kanbot version, keeping your edits. Maps kanbot's old craft skills to capabilities if you have no `capabilities` yet. Runs `sync`. Leaves changes uncommitted. See [Upgrading](./14-upgrading.md).

| Flag        | Default | Description                         |
| ----------- | ------- | ----------------------------------- |
| `--dry-run` | `false` | Show what would change, write none. |

## `kanbot board create`

Create a GitHub Project with the kanbot columns, save it to config and add the repo labels. With `review.copilot`, also adds the Copilot review ruleset. If a project is already set, it only ensures labels and the ruleset. Prints the built-in workflows to enable.

| Flag              | Default   | Description    |
| ----------------- | --------- | -------------- |
| `--title <title>` | repo name | Project title. |

## `kanbot board link`

Use an existing project. Adds the labels, warns about missing columns and prints the workflows to turn on.

| Flag              | Description                        |
| ----------------- | ---------------------------------- |
| `--owner <login>` | User or org that owns the project. |
| `--number <n>`    | Project number.                    |

## `kanbot app create`

Create a GitHub App for kanbot to talk as, save its key in `~/.kanbot/apps/` and set `identity.mode: app`. Opens GitHub in your browser. See [Identity and merging](./12-identity.md#app-mode).

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
- `project-conventions` and `ci.yml` filled in: warns on files unchanged from the template or with `<placeholder>`s left.
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

Show the board by column, daemon PID and provider, the agents running now, then what waits on you, oldest first: plans to approve or answer, PRs to review or merge, approaches to pick, and `needs-human` cards with kanbot's reason. Last come local failure counts and any rate-limit pause.

| Flag             | Description                                                             |
| ---------------- | ----------------------------------------------------------------------- |
| `-f`, `--follow` | Then follow a running agent's log, as `kanbot logs -f`. Asks which one. |

## `kanbot logs`

List recent agent runs, newest first: status, duration, job key and agent. Status is `running`, `ok`, `failed`, `rate limited`, `timed out`, or `cut off` when the daemon stopped mid-run.

Pass a run to read its transcript: assistant text, tool calls and errors. Match it by job key or part of one (`implement:#12`), issue number (`12`), PR (`pr34`) or run id. A running match wins over older ones.

```sh
kanbot logs                # recent runs
kanbot logs 12             # latest run on issue #12
kanbot logs -f             # follow the running agent
kanbot logs pr34 -f -v     # follow the run on PR #34, with tool output
```

| Flag              | Default | Description                                                          |
| ----------------- | ------- | -------------------------------------------------------------------- |
| `-f`, `--follow`  | `false` | Keep printing until the run ends. Without a run, pick a running one. |
| `-n`, `--limit`   | `20`    | How many runs to list.                                               |
| `--raw`           | `false` | Print the raw JSONL transcript.                                      |
| `-v`, `--verbose` | `false` | Also show tool output and reasoning.                                 |

Logs are local to the machine running the daemon.

## `kanbot report`

Show how work flowed in a period: PRs merged, median cycle time (PR opened → merged), median wait on you (agent-reviewed → merged), fix loops (review, CI, conflict, feedback) and `needs-human` causes. It starts with a health label and ends with at most two next steps. Data comes from GitHub, so it covers work from every machine.

Health follows fixed rules:

| Health    | When                                                                   |
| --------- | ---------------------------------------------------------------------- |
| Inactive  | Nothing merged and no active cards.                                    |
| Off track | Nothing merged while items wait on you.                                |
| At risk   | The `wip.awaitingHuman` limit is reached, or cards have `needs-human`. |
| On track  | Otherwise.                                                             |

| Flag             | Default | Description                                                      |
| ---------------- | ------- | ---------------------------------------------------------------- |
| `--since <when>` | `7d`    | Start of the period: `7d`, `2w`, `12h` or `YYYY-MM-DD`.          |
| `--post`         | `false` | Also post it to the board's **Status updates**, with the health. |
| `--json`         | `false` | Print JSON instead of text.                                      |

## `kanbot completion`

Print a shell completion script. See [Shell completion](./01-getting-started.md#shell-completion).

| Flag                        | Default  | Description   |
| --------------------------- | -------- | ------------- |
| `--shell <zsh\|bash\|fish>` | `$SHELL` | Target shell. |

## Files written at runtime

| Path                   | What                                   |
| ---------------------- | -------------------------------------- |
| `.kanbot/logs/*.jsonl` | Full transcript of each agent run.     |
| `.kanbot/logs/*.json`  | Run info: job, agent, start, outcome.  |
| `.kanbot/state.json`   | Failure counts and rate-limit pause.   |
| `.kanbot/daemon.pid`   | Lock so only one daemon runs per repo. |
| `~/.kanbot/worktrees/` | Git worktrees, one per job.            |
| `~/.kanbot/apps/`      | Private keys of kanbot apps.           |

The first three are gitignored by `init`.
