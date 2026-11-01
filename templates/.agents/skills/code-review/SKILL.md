---

name: code-review
description: Checklist for reviewing a code change for correctness, tests, security and maintainability. Use when reviewing a branch or PR diff.
---

# Code review

Find the problems that would hurt users or the team after merge, and say each one so precisely that it can be fixed without a conversation. A short list of real issues beats a long list of preferences.

## Read before judging

- `git log <base>..HEAD` and `git diff <base>...HEAD --stat` to see the shape.
- Read the plan's acceptance criteria and implementation steps; the diff should match them.
- For each non-trivial hunk, open the whole function and its callers. Most real bugs sit at the edges of the diff.
- Run tests, lint and typecheck. Do not assume CI will.

## Checklist (in priority order)

**Correctness**
- Does it do what the plan says for every input, including empty, null, zero, very large, duplicate and unicode input?
- Off-by-one, wrong comparison, inverted condition, missing `await`, unhandled promise, race between concurrent requests.
- State updates: stale state, cache not invalidated, partial writes without a transaction.
- Changed function signatures or behaviour: are all callers updated?

**Tests**
- Does each acceptance criterion have a test that would fail if the feature were removed?
- Do tests assert outcomes, or only that mocks were called?
- Unhappy paths covered? No skipped, weakened or deleted tests?

**Security**
- Input validated at trust boundaries; output encoded (no raw HTML from user input).
- Queries parameterised; no string-built SQL, shell commands or paths from user input.
- Authorisation on every new endpoint, action and data query (can user A read user B's data?).
- No secrets, tokens or personal data in code, logs, fixtures, screenshots or error messages.
- New dependencies: maintained, reasonably sized, licence compatible.

**Data and operations**
- Migrations safe on existing data and reversible, or the irreversibility is stated.
- Backward compatibility of APIs, events and stored formats.
- Errors surfaced to the user or logged with enough context; not swallowed.
- Obvious performance traps: N+1 queries, unbounded lists, work inside render loops.

**Maintainability**
- Follows `project-conventions` and the patterns of neighbouring code.
- Reuses existing utilities instead of duplicating them.
- Names say what things are; no dead code, commented-out code or leftover debug output.
- Complexity proportionate to the problem; no speculative abstractions.

## Findings

Severity, finding format and re-review rounds: follow `review-findings`.
