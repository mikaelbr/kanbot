---

name: project-conventions
description: This project's stack, exact commands (install, run, test, lint, typecheck, build), code conventions and recorded decisions. Read first before planning, implementing, reviewing or fixing anything in this repository, and whenever you need to know how to run tests or the project.
---

# Project conventions

> **TEMPLATE — fill this in.** Replace every `<placeholder>` with the real value for this repository and delete lines that do not apply. Agents treat this file as the source of truth; wrong commands here cause wrong work everywhere. Until it is filled in, agents must discover commands from manifests and CI config and say so in their output.

## Instructions for agents

- Read this skill before doing anything else in the repository.
- Use the commands below exactly. Do not guess alternatives when one is listed.
- If something here is wrong or missing and you learned the right answer (a command, a convention, a gotcha), propose an addition: edit this file in the same branch as a separate commit (`docs(conventions): …`) and mention it under "Notes for reviewer" in the PR. Only add durable facts about commands, stack and conventions. Lessons from human corrections go in `project-memory`. Planners and reviewers, who do not edit files, mention the proposed addition in their summary instead.

## Product

- What it is: `<one sentence: what the product does and for whom>`
- Primary users: `<roles>`
- Language of what users see: `<e.g. Norwegian bokmål, English>`

## Stack

- Language and runtime: `<e.g. TypeScript 5 on Bun, Swift 6, Python 3.13>`
- Main parts: `<one line each: app, service, library, site…>`
- Package manager or build tool: `<use only this one>`

## Commands

| Task        | Command                         |
| ----------- | ------------------------------- |
| Install     | `<install dependencies>`        |
| Run locally | `<start it, and where to look>` |
| Test (all)  | `<run all tests>`               |
| Test (one)  | `<run one file or test>`        |
| Lint        | `<lint>`                        |
| Format      | `<format>`                      |
| Typecheck   | `<typecheck>`                   |
| Build       | `<build>`                       |

Add rows the project needs (migrations, seed data, end-to-end tests…). Environment: `<how to get a working local setup>`

## Layout

```
<dir/   what lives here>
```

## Code conventions

- Naming: `<files, types, functions>`
- Error handling: `<how errors are raised and shown>`
- Tests: `<framework, where tests live, helpers>`
- Commits: Conventional Commits (`feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`) with a scope.
- Do not: `<things that look tempting but are wrong here>`

## Decisions

Record decisions that agents should not relitigate. One line each, newest first.

- `<YYYY-MM-DD>`: `<decision>` because `<reason>`.

## Gotchas

- `<e.g. tests need a local database running>`
- `<e.g. generated files you must never edit>`
