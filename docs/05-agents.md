---

title: Agents
description: Customize the agents that plan, build, review and fix.
slug: agents
---

# Agents

Agents are defined in `.kanbot/agents/<name>.md`. This is the only place to edit them. `kanbot sync` renders them into each provider's format:

- Claude: `.claude/agents/<name>.md` and `.claude/settings.json`
- Codex: `.codex/agents/<name>.toml`

The generated files also let you use the same agents in normal Claude Code or Codex sessions.

## Tiers

- **Column agents** (`tier: column`) are started by the daemon for a board job. They must declare an `output` schema.
- **Subagents** (`tier: sub`) are called by column agents for focused work.

## Default team

| Agent                   | Tier   | Role                                                           |
| ----------------------- | ------ | -------------------------------------------------------------- |
| `planner`               | column | Writes and revises the plan.                                   |
| `implementer-frontend`  | column | Builds UI work.                                                |
| `implementer-backend`   | column | Builds server, API and data work.                              |
| `implementer-docs`      | column | Writes docs.                                                   |
| `implementer-technical` | column | Refactors, infra, tooling and CI.                              |
| `reviewer-code`         | column | Review pass 1: correctness and code quality.                   |
| `reviewer-spec`         | column | Review pass 2: acceptance criteria and UX.                     |
| `fixer`                 | column | Fixes findings, your comments, failing CI and merge conflicts. |
| `explorer`              | sub    | Maps the codebase for a change.                                |
| `plan-critic`           | sub    | Critiques a draft plan.                                        |
| `approach-designer`     | sub    | Designs N approaches for `explore:N`.                          |
| `test-writer`           | sub    | Writes failing tests first.                                    |
| `ui-verifier`           | sub    | Takes screenshots with Playwright.                             |

`planner`, `reviewer-code`, `reviewer-spec` and `fixer` are required. Implementers are picked through [`implementers`](./08-configuration.md#implementers) in config.

## File format

YAML frontmatter, then markdown instructions:

```markdown
---

name: implementer-backend
tier: column
description: Implements an approved plan for server, API and data work.
models: { claude: sonnet, codex: default }
effort: high
tools: [read, edit, bash]
skills: [project-conventions, tdd, pr-description]
subagents: [explorer, test-writer]
output: implement-result
---

You are the backend implementer. ...
```

## Frontmatter

| Field         | Required | Description                                                         |
| ------------- | -------- | ------------------------------------------------------------------- |
| `name`        | yes      | Lowercase, dashes. Must match the filename.                         |
| `tier`        | yes      | `column` or `sub`.                                                  |
| `description` | yes      | When to use the agent. Callers read this.                           |
| `models`      | no       | Model per provider: `{ claude: opus, codex: default }`.             |
| `effort`      | no       | `low`, `medium`, `high`, `xhigh` or `max`.                          |
| `tools`       | no       | Any of `read`, `edit`, `bash`, `web`. Default `[read]`.             |
| `skills`      | no       | Skill names from `.agents/skills/`.                                 |
| `subagents`   | no       | Names of `tier: sub` agents it may call.                            |
| `output`      | column   | `plan-result`, `implement-result`, `review-result` or `fix-result`. |

Tools map to provider tools:

| Tool   | Claude                    | Codex                   |
| ------ | ------------------------- | ----------------------- |
| `read` | Read, Grep, Glob          | read-only sandbox       |
| `edit` | Edit, Write, NotebookEdit | workspace-write sandbox |
| `bash` | Bash                      | workspace-write sandbox |
| `web`  | WebFetch, WebSearch       | —                       |

## Output schemas

Column agents answer with JSON. The daemon turns it into comments, PRs and labels.

| Output             | Used by      | Main fields                                                       |
| ------------------ | ------------ | ----------------------------------------------------------------- |
| `plan-result`      | planner      | `plan`, `summary`, `replies`, `newIssues`, `labels`, `questions`  |
| `implement-result` | implementers | `status`, `prTitle`, `prBody`, `testsRun`, `screenshots`, `risks` |
| `review-result`    | reviewers    | `verdict`, `summary`, `findings`                                  |
| `fix-result`       | fixer        | `addressed`, `summary`, `prBody`                                  |

Schemas are defined in `src/schemas/results.ts` and can't be changed per repo. Agents must match the one they declare.

## Common changes

**Change a model.** Edit `models` and run `kanbot sync`.

**Change behaviour.** Edit the markdown body. Keep it about _how_ to work; the daemon's prompt carries the task.

**Add an implementer.** Copy an implementer file, rename it, then map a label to it:

```yaml
# .kanbot/config.yml
implementers:
  frontend: implementer-frontend
  backend: implementer-backend
  docs: implementer-docs
  infra: implementer-technical
  mobile: implementer-mobile # used for type:mobile
  default: implementer-backend
```

Create the `type:mobile` label in GitHub too.

**Add a subagent.** Create a `tier: sub` file and add its name to a column agent's `subagents`.

## Apply changes

```sh
kanbot sync
git add -A && git commit -m "chore: update agents" && git push
```

The daemon refuses to start if generated files are stale. Never edit files in `.claude/agents/` or `.codex/agents/`; `sync` overwrites them and removes ones whose source was deleted.
