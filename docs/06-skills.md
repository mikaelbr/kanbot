---

title: Skills
description: Customize the shared skills agents load.
slug: skills
---

# Skills

Skills are reusable instructions agents load when relevant. They live in `.agents/skills/<name>/SKILL.md`, the Codex location. `.claude/skills` is a symlink to the same folder, so both providers share them.

## Default skills

| Skill                 | Used for                                                                              |
| --------------------- | ------------------------------------------------------------------------------------- |
| `project-conventions` | Your stack, commands and conventions. **Fill this in first.**                         |
| `project-memory`      | Lessons learned from your corrections. Grows over time.                               |
| `plan-template`       | The plan format.                                                                      |
| `user-stories`        | User stories and Given/When/Then criteria.                                            |
| `issue-splitting`     | Splitting large issues.                                                               |
| `approach-designer`   | Writing N approaches for `explore:N`.                                                 |
| `tdd`                 | Test-first loop.                                                                      |
| `code-review`         | Review checklist and severity rubric.                                                 |
| `spec-review`         | Checking a change against its plan.                                                   |
| `pr-description`      | PR title and body format.                                                             |
| `frontend-design`     | Visual design direction.                                                              |
| `accessibility`       | WCAG 2.2 AA checklist.                                                                |
| `verify-ui`           | Playwright screenshots at 390px and 1280px.                                           |
| `kanbot-admin`        | For you, not board agents. See below.                                                 |
| `kanbot-idea`         | For you: turns an idea into an issue. See [Capturing ideas](./09-capturing-ideas.md). |

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

Agents that find a wrong or missing command may propose an edit to this file in their PR.

## Project memory

Agents start every job fresh. Without memory, you'd give the same correction on PR after PR. `project-memory` is where those corrections stick.

**What goes in.** A fact is a rule plus the reason for it, in one small file:

```markdown
Dates shown to users use the `formatDate` helper, never `toLocaleString`.

**Why:** The app must show Norwegian formats regardless of browser locale. See PR #42.
```

Facts live in `.agents/skills/project-memory/facts/`, with a one-line index in `SKILL.md`. Every board agent reads the index before it starts.

**How facts get written.**

1. You correct something on a PR, for example in a review comment.
2. The `fixer` makes the change. If your correction applies beyond this PR, it also adds a fact, as a separate `docs(memory): …` commit in the same PR.
3. You merge the PR, and the fact with it. Don't want the fact? Ask in a comment to drop it.

You can also add facts yourself, by hand or by asking your agent: "remember that we never call the payment API from the frontend". The [`kanbot-admin`](#kanbot-admin) skill knows how.

**Keeping it true.** When the code changes so a fact no longer holds, agents that touch the area fix or delete the fact. Reviewers flag stale facts as findings.

**Memory or conventions?**

| `project-conventions`              | `project-memory`                             |
| ---------------------------------- | -------------------------------------------- |
| How to build, test and run the app | What the team learned while building it      |
| You write it at setup              | Grows from your corrections, one fact a time |
| One structured file                | Many small facts, each with its reason       |

Both are yours. `kanbot upgrade` never touches them.

## Add a skill

1. Create `.agents/skills/<name>/SKILL.md`.
2. Add the name to `skills` in each agent that should use it. See [Agents](./05-agents.md#frontmatter).
3. Run `kanbot sync`, commit and push.

## Edit or remove a skill

Edit `SKILL.md` directly. To remove one, delete its folder and remove it from every agent's `skills`, then run `kanbot sync`.

Commit and push. Worktrees are made from the base branch, so agents only see pushed changes.
