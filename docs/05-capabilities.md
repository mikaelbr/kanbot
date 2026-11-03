---

title: Capabilities
description: Hand the work on code to your repo's own skills and agents.
slug: capabilities
---

# Capabilities

kanbot runs the process: board, plans, reviews, fixes. How to build, test and review code is up to your repo. Capabilities tell kanbot's agents which of your skills or agents to use.

```yaml
# .kanbot/config.yml
capabilities:
  verify: # prove acceptance criteria
    use: e2e-tests
    when: Changes users see
  preview: # something a human can try
    use: deploy-preview
    required: true
  review: code-review # short for { use: code-review }
  benchmark: # your own name
    use: bench
    when: Changes to the import pipeline
```

| Field      | Meaning                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `use`      | A skill in `.agents/skills` or an agent in `.kanbot/agents`. A bare name is short for `{ use: <name> }`. |
| `when`     | When it applies. Without it, the agent decides.                                                          |
| `required` | `true`: a miss when it applies is a blocker in acceptance review. Default `false`.                       |

The table goes into the implement, review and fix prompts. Agents use a capability when its `when` fits and list what they used under **Validation** in the PR body. Needs you don't map are left to the agent.

## Reserved names

All optional.

| Name      | Used by                                       | For                                           |
| --------- | --------------------------------------------- | --------------------------------------------- |
| `verify`  | `implementer`, `fixer`, `acceptance-reviewer` | Proving acceptance criteria.                  |
| `review`  | `reviewer`                                    | Technical review. Put extra gates here.       |
| `preview` | `implementer`, `fixer`, `acceptance-reviewer` | Something a human can try: a deploy, a build. |

Without `review`, pass 1 is a plain review against `AGENTS.md` and `project-conventions`.

Any other name is yours.

## Agents for one provider

An agent in `.claude/agents` or `.codex/agents` works only with that provider. `kanbot doctor` warns. Put it in `.kanbot/agents` to work with both.

## What workers see

Workers only see what's committed: `AGENTS.md`, `.agents/skills`, agents, and the MCP servers in `.mcp.json`. Never your own plugins, skills or MCP servers.

## Set up

- `kanbot init` asks which of your skills fill `verify`, `review` and `preview`, if you have skills of your own.
- `kanbot doctor` lists what's mapped, flags a `use` that doesn't exist, and names reserved needs you could add.
- `kanbot upgrade` from an older kanbot keeps the craft skills it installed and maps them for you.
