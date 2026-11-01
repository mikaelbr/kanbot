---

title: Configuration
description: Config file, labels, notifications and other options.
slug: configuration
---

# Configuration

## Config file

`.kanbot/config.yml` is created by `init` and `board create`. All fields except `repo` have defaults. kanbot keeps your comments when it updates the file.

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

capabilities: # your skills and agents for kanbot's agents to use
  verify: { use: e2e-tests, when: Changes users see }
  review: code-review

review:
  copilot: false # add GitHub Copilot as a reviewer
  copilotOnPush: false
  copilotWaitMinutes: 15

identity:
  mode: user # user | app
  app: null # set by `kanbot app create`

merge:
  onApproval: false # merge kanbot PRs when you approve them
  method: squash # squash | merge | rebase

codex:
  networkAccess: false

notify:
  desktop: true
  webhook: null
```

Restart the daemon after changes.

### Schema

`init` and `sync` write `.kanbot/config.schema.json`, matching your kanbot version. The header line above points editors at it (VS Code needs the YAML extension), giving autocomplete, docs on hover and errors. `doctor` reports a stale schema.

The schema also ships in the package as `schema/config.schema.json`, e.g. `https://unpkg.com/kanbot/schema/config.schema.json`.

### Columns

Rename columns to match your board's Status field. `kanbot doctor` reports missing ones.

### Concurrency and priority

Each exploratory variant counts as one worker. `priority` orders waiting jobs by kind; board order decides within a kind.

`maxAttempts` counts failed agent jobs. Failing CI and merge conflicts have their own fixed limit of 3 fix attempts per PR.

### Capabilities

Maps needs to your repo's own skills and agents. See [Capabilities](./05-capabilities.md).

### Review

Adds GitHub Copilot as a third reviewer. See [Copilot review](./12-copilot-review.md).

### Identity and merge

Who kanbot talks as, and merging PRs when you approve them. See [Identity and merging](./11-identity.md).

## Notifications

kanbot notifies you when:

- a PR is ready to test,
- exploratory PRs are ready to compare,
- an agent answered your PR feedback or needs input,
- an implementer is blocked,
- an issue needs a human.

In user mode, these are your only notifications about agent work. See [Identity](./11-identity.md#user-mode).

Turn off desktop notifications with `notify.desktop: false`. To get them elsewhere, set a webhook. It receives a JSON `POST` with `title`, `message` and `url`, plus `Title` and `Click` headers, so an [ntfy.sh](https://ntfy.sh) topic URL works as is:

```yaml
notify:
  webhook: https://ntfy.sh/my-secret-topic
```

## Labels

`kanbot board create` adds these labels.

| Label            | Set by       | Meaning                                     |
| ---------------- | ------------ | ------------------------------------------- |
| `technical`      | you, planner | Plan as a technical goal, not a user story. |
| `explore:2..4`   | you          | Build N approaches as N PRs.                |
| `variant:1..4`   | kanbot       | Marks which approach a PR is.               |
| `kanbot:working` | kanbot       | An agent is working on it.                  |
| `agent-reviewed` | kanbot       | Passed agent review. Ready for you.         |
| `needs-human`    | kanbot       | Agents stopped. Remove it to retry.         |
| `kanbot-review`  | you          | Agent review for a PR without a card.       |

## Shared agent rules

`AGENTS.md` holds rules every agent follows, in kanbot and in normal sessions. `CLAUDE.md` imports it. Add repo-wide rules here; put commands and conventions in the [`project-conventions` skill](./07-skills.md#project-conventions).

## Issue and PR templates

`init` adds issue templates in `.github/ISSUE_TEMPLATE/` (user need and technical task) and `.github/pull_request_template.md`. Edit them freely.

## CI

Agents fix failing CI on their PRs. Adjust `.github/workflows/ci.yml` to run your tests, lint and typecheck.

`.github/workflows/kanbot-merged.yml` closes sibling PRs when one exploratory PR is merged. It runs on GitHub, so it works when the daemon is off.
