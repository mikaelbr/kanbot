---

title: Project conventions
description: Tell agents your stack, commands and rules. Every agent reads it first.
slug: project-conventions
---

# Project conventions

`project-conventions` tells agents how your project works: the stack, the exact commands, and the rules. Every board agent reads it before it starts. It's the one file kanbot needs from you.

It lives in `.agents/skills/project-conventions/SKILL.md`. `kanbot init` adds it as a template, and you own it from then on. `kanbot upgrade` never touches it.

## Why it matters

Agents start every job fresh and know nothing about your repo. They run the commands from this file exactly as written. If a command is wrong, every plan, build, review and fix goes wrong too.

Until it's filled in, agents have to work out the commands from manifests and CI, and say so in their output. `kanbot doctor` warns until then.

## Fill it in

Let your agent write the first draft. In the repo, ask:

> Fill in project-conventions from the code, manifests and CI. Ask me what you can't find.

Then check the draft:

1. Run every command in the table. Agents will run them too.
2. Delete rows and lines that don't apply. Don't leave guesses in.
3. Delete the **TEMPLATE** note at the top.
4. Make `.github/workflows/ci.yml` run the same lint, typecheck and test commands.
5. Run `kanbot doctor`, then commit and push. Agents only see what's pushed.

## What goes in

| Section          | Write                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| Product          | What it is, who uses it, the language users see.                         |
| Stack            | Language, runtime, main parts, and the one package manager to use.       |
| Commands         | Exact commands. Include how to run one test, since agents test narrowly. |
| Layout           | Top-level folders and what lives in them.                                |
| Code conventions | Naming, error handling, test setup, and what **not** to do.              |
| Decisions        | Choices agents shouldn't reopen, with the reason.                        |
| Gotchas          | Things that trip up newcomers: services to start, generated files.       |

Be specific. Agents follow what's written, not what you meant.

| Vague              | Specific                                                  |
| ------------------ | --------------------------------------------------------- |
| Run the tests      | `pnpm vitest run src/foo.test.ts -t "name"`               |
| Use good naming    | Components in `PascalCase.tsx`, hooks start with `use`    |
| Be careful with DB | Never edit `migrations/` by hand. Run `pnpm db:migrate`   |
| We use React       | React 19 with server components. No client data fetching. |

## Example

[kanbot-example-app](https://github.com/mikaelbr/kanbot-example-app) is a small React app with the file filled in. Read its [`project-conventions`](https://github.com/mikaelbr/kanbot-example-app/blob/main/.agents/skills/project-conventions/SKILL.md), or [see the diff](https://github.com/mikaelbr/kanbot-example-app/commit/1dac372db490e1db21166e318e838d0f0898a7e2) from the template. An excerpt:

```markdown
## Commands

| Task       | Command                                        |
| ---------- | ---------------------------------------------- |
| Install    | `pnpm install`                                 |
| Test (all) | `pnpm test`                                    |
| Test (one) | `pnpm vitest run src/App.test.tsx -t "<name>"` |
| Lint       | `pnpm lint`                                    |
| Typecheck  | `pnpm typecheck`                               |

## Code conventions

- State: book changes are pure functions in `src/lib/books.ts` that return a new array. Components call them; they don't change books themselves.
- Do not: add a state library, a router or a CSS framework without a plan that asks for it.

## Decisions

- 2026-11-02: `localStorage`, no backend, because the app is for one person on one device.

## Gotchas

- `localStorage` is shared between tests. `src/test-setup.ts` clears it after each test; keep it that way.
```

## What goes elsewhere

| Put it in                                  | When it is                                         |
| ------------------------------------------ | -------------------------------------------------- |
| `AGENTS.md`                                | A rule for every agent, in and out of kanbot.      |
| [`project-memory`](./09-project-memory.md) | A lesson from a correction on a PR.                |
| [Capabilities](./05-capabilities.md)       | A whole way of working, like your review or tests. |
| `.github/workflows/ci.yml`                 | A check that must pass before merge.               |

## Keeping it current

When an agent finds a wrong or missing command, it fixes the file in its PR as a separate `docs(conventions): …` commit and notes it for the reviewer. Review that commit like code. Planners and reviewers don't edit files, so they mention it in their summary.

When you change the stack or a command, update this file in the same PR.
