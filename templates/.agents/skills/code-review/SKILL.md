---

name: code-review
description: Checklist, severity rubric and finding format for reviewing a code change. Use when reviewing a branch or PR diff for correctness, tests, security and maintainability, when deciding finding severity, or when judging whether a fixer resolved a finding.
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

## Severity rubric

| Severity  | Meaning                                                                                                                                         | Blocks merge |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `blocker` | Wrong behaviour on a main path, data loss or corruption, security hole, failing tests/build, acceptance criterion untested and broken           | Yes          |
| `major`   | Bug in an edge case users will hit, missing test for a criterion, broken error handling, convention violation that will spread, risky migration | Yes          |
| `minor`   | Real but low-impact issue: unclear naming, small duplication, missing test for a rare edge case                                                 | No           |
| `nit`     | Preference or polish. Use sparingly; at most 3 per review                                                                                       | No           |

When unsure between two levels, pick the lower one and explain the risk.

## Writing a finding

Each finding has: location, what is wrong, why it matters, and a suggested fix.

> `src/invoices/service.ts:84` — `total` is computed before discounts are applied, so invoices with a discount code show the undiscounted amount (criterion 3). Move the `applyDiscounts` call above the sum, and add a test with a 10% code.

- One problem per finding. Merge repeats into one finding listing all locations.
- Point at the line in the new version of the file.
- Show a failure scenario ("a user with no projects gets a 500") rather than a principle ("this is not robust").
- Suggest the fix, and code only if short.
- Ask a question only when you genuinely could not determine the answer by reading; say what you checked.

## Avoid

- More than ~10 findings. If you have more, keep the most important and summarise the rest in one finding.
- Nit storms: formatting, import order and style a linter or formatter covers.
- Requesting scope beyond the plan. Suggest a follow-up issue as a `nit` at most.
- Rewriting the author's working approach to your preferred one without a concrete defect.
- Approving with an unresolved `blocker` or `major`.

## Re-review rounds

For each previous finding: fixed (drop it), not fixed (repeat with the same id and what is still wrong), or the fixer disagreed (accept the reasoning, or explain once more why it matters). Check that fixes did not introduce new problems.
