---

title: Skills
description: Customize the shared skills agents load.
slug: skills
---

# Skills

Skills are reusable instructions agents load when relevant. They live in `.agents/skills/<name>/SKILL.md`, the Codex location. `.claude/skills` is a symlink to the same folder, so both providers share them.

## Default skills

| Skill                 | Used for                                                      |
| --------------------- | ------------------------------------------------------------- |
| `project-conventions` | Your stack, commands and conventions. **Fill this in first.** |
| `plan-template`       | The plan format.                                              |
| `user-stories`        | User stories and Given/When/Then criteria.                    |
| `issue-splitting`     | Splitting large issues.                                       |
| `approach-designer`   | Writing N approaches for `explore:N`.                         |
| `tdd`                 | Test-first loop.                                              |
| `code-review`         | Review checklist and severity rubric.                         |
| `spec-review`         | Checking a change against its plan.                           |
| `pr-description`      | PR title and body format.                                     |
| `frontend-design`     | Visual design direction.                                      |
| `accessibility`       | WCAG 2.2 AA checklist.                                        |
| `verify-ui`           | Playwright screenshots at 390px and 1280px.                   |
| `kanbot-admin`        | For you, not board agents. See below.                         |

## kanbot-admin

Board agents use the other skills. `kanbot-admin` is for you, when you work on the kanbot setup itself in a normal Claude Code or Codex session. Ask in plain words:

> Add an implementer for mobile work.
> Make the reviewers stricter about accessibility.
> Upgrade kanbot.

The agent finds the skill and knows where things live, which files are generated, and the steps for each change: edit agents and skills, update config, run `sync` and `doctor`, upgrade, and merge `.kanbot-new` files. You review the diff and commit.

kanbot owns this skill, so `kanbot upgrade` always replaces it. Put your own notes in `project-conventions` instead.

## File format

```markdown
---

name: my-skill
description: What it covers and when to use it.
---

# My skill

Instructions...
```

`name` must match the folder name. The `description` decides when an agent loads the skill, so say what it covers and when it applies.

A skill folder can hold extra files, like templates or scripts. Reference them from `SKILL.md`.

## Project conventions

`project-conventions` is a template. Replace every `<placeholder>` with real values: stack, commands, layout, code conventions, decisions and gotchas. Agents use these commands exactly.

Agents that learn something durable may propose an edit to this file in their PR.

## Add a skill

1. Create `.agents/skills/<name>/SKILL.md`.
2. Add the name to `skills` in each agent that should use it. See [Agents](./05-agents.md#frontmatter).
3. Run `kanbot sync`, commit and push.

## Edit or remove a skill

Edit `SKILL.md` directly. To remove one, delete its folder and remove it from every agent's `skills`, then run `kanbot sync`.

Commit and push. Worktrees are made from the base branch, so agents only see pushed changes.
