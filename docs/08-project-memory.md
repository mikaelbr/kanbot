---

title: Project memory
description: Corrections you give on PRs become facts agents read on every job.
slug: project-memory
---

# Project memory

Agents start every job fresh. Without memory, you'd give the same correction on PR after PR. `project-memory` is where those corrections stick.

## What goes in

A fact is a rule plus the reason for it, in one small file:

```markdown
Dates shown to users use the `formatDate` helper, never `toLocaleString`.

**Why:** The app must show Norwegian formats regardless of browser locale. See PR #42.
```

Facts live in `.agents/skills/project-memory/facts/`, with a one-line index in `SKILL.md`. Every board agent reads the index before it starts.

## How facts get written

1. You correct something on a PR, for example in a review comment.
2. The `fixer` makes the change. If your correction applies beyond this PR, it also adds a fact, as a separate `docs(memory): …` commit in the same PR.
3. You merge the PR, and the fact with it. Don't want the fact? Ask in a comment to drop it.

You can also add facts yourself, by hand or by asking your agent: "remember that we never call the payment API from the frontend". The [`kanbot-admin`](./07-skills.md#admin-skills) skill knows how.

## Keeping it true

When the code changes so a fact no longer holds, agents that touch the area fix or delete the fact. Reviewers flag stale facts as findings.

## Memory or conventions?

| `project-conventions`              | `project-memory`                             |
| ---------------------------------- | -------------------------------------------- |
| How to build, test and run the app | What the team learned while building it      |
| You write it at setup              | Grows from your corrections, one fact a time |
| One structured file                | Many small facts, each with its reason       |

Both are yours. `kanbot upgrade` never touches them.
