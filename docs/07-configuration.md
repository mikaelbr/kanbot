---

title: Configuration
description: Config file, labels, notifications and other options.
slug: configuration
---

# Configuration

## Config file

`.autogh/config.yml` is created by `init` and `board create`. All fields except `repo` have defaults. autogh keeps your comments when it updates the file.

```yaml
# yaml-language-server: $schema=./config.schema.json
provider: claude # claude | codex
repo: owner/name
baseBranch: main
project: { owner: my-org, number: 7 }

columns: # names of the board's Status options
  ideas: Ideas
  planning: Planning
  ready: Ready
  inProgress: In Progress
  review: Review
  done: Done

concurrency: 3 # max agent workers at once
pollSeconds: 60 # min 10
priority: [fix, review, plan, implement] # which waiting jobs run first
maxAttempts: 2 # failures before needs-human

timeoutMinutes:
  plan: 20
  implement: 90
  review: 30
  fix: 45

implementers: # type:<key> label → agent
  frontend: implementer-frontend
  backend: implementer-backend
  docs: implementer-docs
  infra: implementer-technical
  default: implementer-backend

codex:
  networkAccess: false

notify:
  desktop: true
  webhook: null
```

Restart the daemon after changes.

### Schema

`init` and `sync` write `.autogh/config.schema.json`, matching your autogh version. The header line above points editors at it (VS Code needs the YAML extension), giving autocomplete, docs on hover and errors. `doctor` reports a stale schema.

The schema also ships in the package as `schema/config.schema.json`, e.g. `https://unpkg.com/autogh/schema/config.schema.json`.

### Columns

Rename columns to match your board's Status field. `autogh doctor` reports missing ones.

### Concurrency and priority

Each exploratory variant counts as one worker. `priority` orders waiting jobs by kind; board order decides within a kind.

### Implementers

Maps a `type:*` label to an agent. Issues without a matching label use `default`. See [Agents](./05-agents.md#common-changes).

## Notifications

autogh acts as your GitHub account, so GitHub won't notify you about agent work. autogh notifies you when:

- a PR is ready to test,
- exploratory PRs are ready to compare,
- an agent answered your PR feedback or needs input,
- an implementer is blocked,
- an issue needs a human.

Turn off desktop notifications with `notify.desktop: false`. To get them elsewhere, set a webhook. It receives a JSON `POST` with `title`, `message` and `url`, plus `Title` and `Click` headers, so an [ntfy.sh](https://ntfy.sh) topic URL works as is:

```yaml
notify:
  webhook: https://ntfy.sh/my-secret-topic
```

## Labels

`autogh board create` adds these labels.

| Label                                 | Set by  | Meaning                                     |
| ------------------------------------- | ------- | ------------------------------------------- |
| `technical`                           | you     | Plan as a technical goal, not a user story. |
| `type:frontend\|backend\|docs\|infra` | planner | Picks the implementer.                      |
| `explore:2..4`                        | you     | Build N approaches as N PRs.                |
| `variant:1..4`                        | autogh  | Marks which approach a PR is.               |
| `autogh:working`                      | autogh  | An agent is working on it.                  |
| `agent-reviewed`                      | autogh  | Passed agent review. Ready for you.         |
| `needs-human`                         | autogh  | Agents stopped. Remove it to retry.         |

## Shared agent rules

`AGENTS.md` holds rules every agent follows, in autogh and in normal sessions. `CLAUDE.md` imports it. Add repo-wide rules here; put commands and conventions in the [`project-conventions` skill](./06-skills.md#project-conventions).

## Issue and PR templates

`init` adds issue templates in `.github/ISSUE_TEMPLATE/` (user story and technical) and `.github/pull_request_template.md`. Edit them freely.

## CI

Agents fix failing CI on their PRs, up to 3 times per PR. Adjust `.github/workflows/ci.yml` to run your tests, lint and typecheck.

`.github/workflows/autogh-merged.yml` closes sibling PRs when one exploratory PR is merged. It runs on GitHub, so it works when the daemon is off.

## Limitations

- Ready-column order is the project's manual item order, not a view's sort.
- Workers run as your user. `gh` and `git push` are blocked by command patterns, not missing credentials.
