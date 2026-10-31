---

name: project-conventions
description: This project's stack, exact commands (install, test, lint, typecheck, build, dev server), code conventions and recorded decisions. Read first before planning, implementing, reviewing or fixing anything in this repository, and whenever you need to know how to run tests or start the app.
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
- Language/locale of the UI: `<e.g. Norwegian bokmål, English>`

## Stack

- Language and runtime: `<e.g. TypeScript 5, Node 22 / Bun 1.x>`
- Frontend: `<framework, router, styling approach, component library / design system location>`
- Backend: `<framework, API style (REST/GraphQL/RPC)>`
- Data: `<database, ORM/query builder, migration tool>`
- Package manager: `<pnpm | npm | bun | yarn>` (use only this one)

## Commands

| Task            | Command                                  |
| --------------- | ---------------------------------------- |
| Install         | `<pnpm install>`                         |
| Dev server      | `<pnpm dev>` → `<http://localhost:5173>` |
| Test (all)      | `<pnpm test>`                            |
| Test (one file) | `<pnpm vitest run path/to/file.test.ts>` |
| Test (one name) | `<pnpm vitest run -t "name">`            |
| E2E             | `<pnpm playwright test>`                 |
| Lint            | `<pnpm lint>`                            |
| Format          | `<pnpm format>`                          |
| Typecheck       | `<pnpm typecheck>`                       |
| Build           | `<pnpm build>`                           |
| DB migrate      | `<pnpm db:migrate>`                      |
| Seed data       | `<pnpm db:seed>`                         |

Environment: `<how to get a working .env for local dev and tests, e.g. cp .env.example .env; which variables have safe defaults>`

## Layout

```
<src/            app code>
<src/components/ shared UI components>
<src/server/     API handlers>
<tests/          …>
```

## Code conventions

- Naming: `<files kebab-case, components PascalCase, …>`
- Error handling: `<e.g. return Result types in domain code; throw HttpError in handlers>`
- Validation: `<e.g. zod schemas at API boundaries in src/schemas>`
- State/data fetching: `<e.g. TanStack Query; no fetch in components>`
- Styling: `<e.g. CSS modules + tokens in src/styles/tokens.css; no inline colors>`
- Tests: `<framework, location (co-located *.test.ts), factories in tests/factories>`
- Commits: Conventional Commits (`feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`) with a scope.
- Do not: `<things that look tempting but are wrong here>`

## Decisions

Record decisions that agents should not relitigate. One line each, newest first.

- `<YYYY-MM-DD>`: `<decision>` because `<reason>`.

## Gotchas

- `<e.g. tests need Docker running for Postgres>`
- `<e.g. generated files in src/gen/ — never edit, run pnpm codegen>`
