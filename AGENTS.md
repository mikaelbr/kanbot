# AGENTS.md

## Commits

- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …). They decide the next version and release notes. Mark breaking changes with `!` or a `BREAKING CHANGE:` footer.
- Never add Claude as co-author. No `Co-Authored-By: Claude` lines in commits or PRs.

## Tooling

- Use Bun to run and test: `bun test`, `bun run typecheck`.
- Format and lint with Biome: `bun run fix`. Run `bun run check` before committing.

## CLI

The CLI should be as helpful as possible. With every change, check that it still guides the user:

- `--help` descriptions say what each command and flag does.
- Errors are `UserError`s with `why`, `fix` and `docs` where it helps.
- `doctor` checks new requirements and prints a fix.
- Shell completion (`kanbot completion`) covers it. It is built from the citty command tree, so define commands, flags and enum `options` there. Values completion can't see (positionals, dynamic values) need code in `src/completion.ts`. `test/completion.test.ts` checks every command and flag.
- Next steps printed by `init`, `upgrade` and `board create` match the flow.
- `docs/14-usage.md`, other docs and the `kanbot-guide` and `kanbot-admin` skills match the CLI. `test/usage-docs.test.ts` checks commands, flags and docs links.
- Run `bun run kanbot <command> --help` to see the result.

## Templates

- After editing anything in `templates/`, run `bun run fix`, then `bun run hashes`, and commit `src/known-hashes.json`. A test fails otherwise.
- New template files are "shared" by default. Add a prefix to `CLASSES` in `src/templates.ts` if users or kanbot should own it.

## Writing

- Keep all text short, simple, and to the point. Applies to code comments, docs, commit messages, PRs, and agent output.
