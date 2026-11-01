---

title: Skills
description: Customize the shared skills agents load.
slug: skills
---

# Skills

Skills are reusable instructions agents load when relevant. They live in `.agents/skills/<name>/SKILL.md`, the Codex location. `.claude/skills` is a symlink to the same folder, so both providers share them.

There are two kinds:

- **Board skills** help board agents do the work on cards: plan, build, review and fix.
- **Admin skills** help you run kanbot itself, in a normal Claude Code or Codex session. Board agents don't use them.

## Board skills

| Skill                 | Used for                                                      |
| --------------------- | ------------------------------------------------------------- |
| `project-conventions` | Your stack, commands and conventions. **Fill this in first.** |
| `project-memory`      | Lessons learned from your corrections. Grows over time.       |
| `plan-template`       | The plan format.                                              |
| `user-stories`        | User stories and Given/When/Then criteria.                    |
| `issue-splitting`     | Splitting large issues.                                       |
| `approach-designer`   | Writing N approaches for `explore:N`.                         |
| `review-findings`     | Severity rubric, finding format and review rounds.            |
| `spec-review`         | Checking a change against its plan.                           |
| `pr-description`      | PR title and body format.                                     |

These skills cover the process only. Skills for building, testing and reviewing code are yours: add them to `.agents/skills` and map them under [capabilities](./05-capabilities.md).

## Admin skills

| Skill          | Used for                                                                          |
| -------------- | --------------------------------------------------------------------------------- |
| `kanbot-guide` | Explaining kanbot: guided setup, choosing options, finding docs, troubleshooting. |
| `kanbot-admin` | Changing the kanbot setup: agents, skills, memory, config, identity, upgrades.    |
| `kanbot-idea`  | Turning an idea into an issue. See [Capturing ideas](./03-capturing-ideas.md).    |

Ask in plain words. Your agent finds the right skill:

> Help me set up kanbot in this repo.
> Should kanbot talk as a bot or as me?
> Map our e2e skill as the verify capability.
> Make the acceptance review stricter about scope.
> Upgrade kanbot.

`kanbot-guide` walks you through setup step by step, explains each option with a recommendation, and links the right docs page. Install it for your user with `kanbot skills install` to use it before a repo has kanbot.

`kanbot-admin` knows where things live, which files are generated, and the steps for each change: edit agents and skills, update config, run `sync` and `doctor`, upgrade, and merge `.kanbot-new` files. You review the diff and commit.

kanbot owns the admin skills, so `kanbot upgrade` always replaces them. Put your own notes in `project-conventions` instead.

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

You can also add facts yourself, by hand or by asking your agent: "remember that we never call the payment API from the frontend". The [`kanbot-admin`](#admin-skills) skill knows how.

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
2. Add the name to `skills` in each agent that should use it. See [Agents](./06-agents.md#frontmatter).
3. Run `kanbot sync`, commit and push.

## Edit or remove a skill

Edit `SKILL.md` directly. To remove one, delete its folder and remove it from every agent's `skills`, then run `kanbot sync`.

Commit and push. Worktrees are made from the base branch, so agents only see pushed changes.
