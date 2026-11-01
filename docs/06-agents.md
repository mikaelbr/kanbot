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

kanbot's agents run the process. The work on code is done by your repo's own skills and agents, through [capabilities](./05-capabilities.md).

| Agent                 | Tier   | Role                                                                 |
| --------------------- | ------ | -------------------------------------------------------------------- |
| `planner`             | column | Writes and revises the plan.                                         |
| `implementer`         | column | Builds the plan, using your capabilities.                            |
| `reviewer`            | column | Review pass 1: technical review, through the `review` capability.    |
| `acceptance-reviewer` | column | Review pass 2: acceptance criteria, required capabilities and scope. |
| `fixer`               | column | Fixes findings, your comments, failing CI and merge conflicts.       |
| `explorer`            | sub    | Maps the codebase for a change.                                      |
| `plan-critic`         | sub    | Critiques a draft plan.                                              |
| `approach-designer`   | sub    | Designs N approaches for `explore:N`.                                |

All column agents are required.

## File format

YAML frontmatter, then markdown instructions:

```markdown
---

name: implementer
tier: column
description: Implements an approved plan on the current branch.
models: { claude: sonnet, codex: default }
effort: high
tools: [read, edit, bash]
skills: [project-conventions, project-memory, pr-description]
subagents: [explorer]
output: implement-result
---

You turn an approved plan into a committed change. ...
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

| Output             | Used by     | Main fields                                                      |
| ------------------ | ----------- | ---------------------------------------------------------------- |
| `plan-result`      | planner     | `plan`, `summary`, `replies`, `newIssues`, `labels`, `questions` |
| `implement-result` | implementer | `status`, `prTitle`, `prBody`, `testsRun`, `risks`               |
| `review-result`    | reviewers   | `verdict`, `summary`, `findings`                                 |
| `fix-result`       | fixer       | `addressed`, `summary`, `prBody`                                 |

Schemas are defined in `src/schemas/results.ts` and can't be changed per repo. Agents must match the one they declare.

## Common changes

**Change a model.** Edit `models` and run `kanbot sync`.

**Change behaviour.** Edit the markdown body. Keep it about _how_ to work; the daemon's prompt carries the task.

**Add craft.** Don't add implementers. Add a skill or agent for the work and map it under [`capabilities`](./05-capabilities.md). kanbot's agents use it when its `when` fits.

**Add a subagent.** Create a `tier: sub` file and add its name to a column agent's `subagents`.

## Apply changes

```sh
kanbot sync
git add -A && git commit -m "chore: update agents" && git push
```

The daemon refuses to start if generated files are stale. Never edit files in `.claude/agents/` or `.codex/agents/`; `sync` overwrites them and removes ones whose source was deleted.
