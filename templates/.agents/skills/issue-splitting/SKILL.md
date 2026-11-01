---

name: issue-splitting
description: Split large issues into small, vertical, independently shippable slices using INVEST and standard splitting patterns. Use when a plan feels too big for one PR, has more than ~7 acceptance criteria, touches many unrelated areas, when a human asks to split, or when deciding whether follow-up work becomes a sub-issue or an idea.
---

# Issue splitting

The goal is the smallest change that delivers something a user can notice (or that measurably unblocks the next change), shipped in one reviewable PR. Small slices get reviewed properly, merge without conflicts, and give feedback early.

## Is it too big?

Split when any of these hold:

- More than ~7 acceptance criteria, or criteria about clearly separate outcomes.
- Expected diff over ~400 changed lines (excluding generated files and lockfiles).
- More than one user role or more than one screen/flow is changed.
- It contains "and" in the want: "I want to filter **and** export".
- An implementation step hides a large unknown ("integrate with payment provider").
- You cannot describe how a reviewer tests it in five steps.

## INVEST check for each slice

- **Independent**: can merge in any order relative to sibling slices, or the order is explicit in `blockedBy`.
- **Negotiable**: describes the need, leaves room in how.
- **Valuable**: a user or operator notices something, even if small.
- **Estimable**: no unbounded unknowns; otherwise spike first.
- **Small**: one PR, one concern.
- **Testable**: has Given/When/Then criteria.

## Slice vertically, not horizontally

Wrong: "1. database tables, 2. API, 3. UI". None of these is usable alone.
Right: "1. view a list of invoices (read-only, newest first), 2. filter by status, 3. mark an invoice as paid". Each goes through every layer it needs.

## Splitting patterns

Try these in order; pick the one that gives the thinnest valuable first slice.

| Pattern              | Split by                                                                                                     | Example                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Workflow steps       | Steps in the user's flow; ship the simplest end-to-end path first                                            | Checkout: pay with saved card → add new card → apply discount code                          |
| Business rules       | One rule per slice                                                                                           | Shipping: flat rate → free over 500 kr → regional surcharges                                |
| Data variations      | Types or sources of data                                                                                     | Import: CSV → Excel → Google Sheets                                                         |
| Happy / unhappy path | Success first, then error handling and edge cases (only if the first slice still fails safely)               | Upload: valid file → size limit → resumable upload                                          |
| Interface variations | Simplest interface first                                                                                     | Keyboard shortcut → command palette entry → settings UI                                     |
| Operations (CRUD)    | One operation per slice                                                                                      | Create tag → rename tag → delete tag                                                        |
| Roles                | One user role at a time                                                                                      | Members can comment → guests can comment                                                    |
| Performance later    | Make it work, then make it fast                                                                              | Synchronous report → background job with progress                                           |
| Spike                | A time-boxed investigation that answers one question, output is a decision or prototype, not production code | "Can we use the bank's API for reconciliation? Spike: authenticate and fetch one statement" |

Never split by layer, by "frontend/backend", or into "tests later".

## Smallest shippable first slice

Ask: what is the least we could ship that someone would use or that teaches us something? Usually: one role, one happy path, one data type, hard-coded defaults instead of settings, no bulk operations. Behind a feature flag is fine if the project has flags.

## Sub-issue or idea?

- **Sub-issue** (`subIssue: true`): a slice of this issue's need that someone should build next. Column `planning` if it is clear enough to plan now, `ideas` if it needs the human to prioritise first.
- **Idea** (`subIssue: false`, column `ideas`): related but a different need, a nice-to-have you noticed, or tech debt discovered along the way.
- **Neither**: things that are just part of doing this slice well. Keep them in the plan.

## Order

kanbot won't start a Ready card while its `blockedBy` issues are open. Set `blockedBy` on each slice to what must merge first; usually the previous slice. Leave it empty only when the slice truly stands alone.

When splitting, this issue keeps the first slice. Rewrite its plan to cover only that slice and list the other slices under `## Out of scope` with a note that they were proposed as new issues.

## Body for each new slice

```markdown
As a <user>, I want <capability>, so that <outcome>.

<Two to four sentences: the need, and how this slice relates to the parent issue.>

### Draft acceptance criteria

- [ ] Given …, when …, then …

Split from #<parent> (slice 2 of 3).
```
