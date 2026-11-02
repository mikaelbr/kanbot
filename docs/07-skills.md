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

| Skill                 | Used for                                                                                |
| --------------------- | --------------------------------------------------------------------------------------- |
| `project-conventions` | Your stack, commands and rules. See [Project conventions](./08-project-conventions.md). |
| `project-memory`      | Lessons from your corrections. See [Project memory](./09-project-memory.md).            |
| `plan-template`       | The plan format.                                                                        |
| `user-stories`        | User stories and Given/When/Then criteria.                                              |
| `issue-splitting`     | Splitting large issues.                                                                 |
| `approach-designer`   | Writing N approaches for `explore:N`.                                                   |
| `review-findings`     | Severity rubric, finding format and review rounds.                                      |
| `spec-review`         | Checking a change against its plan.                                                     |
| `pr-description`      | PR title and body format.                                                               |

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

## Add a skill

1. Create `.agents/skills/<name>/SKILL.md`.
2. Add the name to `skills` in each agent that should use it. See [Agents](./06-agents.md#frontmatter).
3. Run `kanbot sync`, commit and push.

## Edit or remove a skill

Edit `SKILL.md` directly. To remove one, delete its folder and remove it from every agent's `skills`, then run `kanbot sync`.

Commit and push. Worktrees are made from the base branch, so agents only see pushed changes.
