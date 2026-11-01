---

name: review-findings
description: Severity rubric, finding format and re-review rounds for kanbot reviews. Use when writing review findings, deciding severity, or judging whether a fixer resolved a finding.
---

# Review findings

kanbot turns findings into a fix loop. Severity decides what gets fixed, so get it right.

## Severity

| Severity  | Meaning                                                                                              | Triggers a fix |
| --------- | ---------------------------------------------------------------------------------------------------- | -------------- |
| `blocker` | Wrong behaviour on a main path, data loss, security hole, failing checks, unmet acceptance criterion | Yes            |
| `major`   | Bug users will hit, missing test for a criterion, missed required capability, risky scope creep      | Yes            |
| `minor`   | Real but low impact: unclear naming, small duplication, rare edge case untested                      | Yes            |
| `nit`     | Preference or polish. At most 3 per review                                                           | No             |

When unsure between two levels, pick the lower one and say the risk.

## Writing a finding

Location, what is wrong, why it matters, the fix. One to three sentences.

> `src/invoices/service.ts:84` — `total` is summed before discounts, so discounted invoices show the full amount (criterion 3). Apply discounts first and add a test with a 10% code.

- One problem per finding. Merge repeats into one finding with all locations.
- Point at the line in the new version of the file. `path` and `line` null for cross-cutting findings.
- Show a failure ("a user with no projects gets a 500"), not a principle ("not robust").
- Only what you checked. If unsure, say what would confirm it.

## Avoid

- More than ~10 findings. Keep the most important; summarise the rest in one.
- Style a formatter or linter covers.
- Scope beyond the plan. Suggest a follow-up issue as a `nit` at most.
- Rewriting a working approach to your taste without a concrete defect.
- Approving with an open `blocker` or `major`.

## Verdict

`changes` with any `blocker` or `major`; otherwise `approve`. Minor findings and nits may come with an approval.

## Re-review rounds

For each earlier finding: fixed (drop it), not fixed (repeat with the same id and what is still wrong), or the fixer disagreed (accept the reason, or explain once more why it matters). Check that fixes didn't add new problems.
