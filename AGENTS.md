# AGENTS.md

## Commits

- Never add Claude as co-author. No `Co-Authored-By: Claude` lines in commits or PRs.

## Tooling

- Use Bun to run and test: `bun test`, `bun run typecheck`.
- Format and lint with Biome: `bun run fix`. Run `bun run check` before committing.

## Templates

- After editing anything in `templates/`, run `bun run hashes` and commit `src/known-hashes.json`. A test fails otherwise.
- New template files are "shared" by default. Add a prefix to `CLASSES` in `src/templates.ts` if users or kanbot should own it.

## Writing

- Keep all text short, simple, and to the point. Applies to code comments, docs, commit messages, PRs, and agent output.
