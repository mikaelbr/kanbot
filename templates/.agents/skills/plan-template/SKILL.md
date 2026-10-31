---

name: plan-template
description: The exact markdown structure for an kanbot issue plan, with an example. Use whenever writing, revising or critiquing a plan in the Planning column, or when an implementer or reviewer needs to know which plan section holds what.
---

# Plan template

The plan lives in the issue body. It is the contract for the implementer and both reviewers, and a human approves it by reading it. Keep it short: the reader should grasp it in one minute. Say what and why; the implementer decides how.

```markdown
## User story

As a <user in context>, I want <capability>, so that <outcome>.
Need: <one or two sentences: what hurts today and how we'll know it worked.>
<!-- `technical` issues: "## Technical goal" instead, naming who benefits. -->

## Acceptance criteria

- [ ] Given <context>, when <action>, then <observable result>.
<!-- 2-6 items. Cover the happy path plus the edge cases that matter. -->

## Out of scope

- <Only what a reader would otherwise expect. Omit the section if nothing.>

## Design notes

<UI: placement, key copy, states that differ from the obvious. Non-UI: API or data shape. 1-4 lines. Omit if nothing beyond the criteria.>

## Implementation steps

1. <Atomic step, with its test.> Files: `path/a.ts`
<!-- 1-5 steps. -->

## Approaches

<!-- Only with explore:N. Exactly N, see the approach-designer skill. -->

## Open questions

- <Only what blocks the human's approval, with the default you assume. Omit if none.>
```

## Rules

- Required: User story (or Technical goal), Acceptance criteria, Implementation steps. Omit other sections when empty; don't write "None."
- One line per bullet. No prose paragraphs, no repeating the issue text.
- Acceptance criteria are shared by all approaches. Approach-specific steps go inside each `### Approach k`.
- File paths come from reading the code, not guesses. Mark new files "(new)".
- No code blocks. Aim for under 30 lines (excluding approaches); much longer means split the issue.

## Example

```markdown
## User story

As a freelancer invoicing at month end, I want to see time entries with no project, so that I fix them before invoicing.
Need: entries without a project silently drop off invoices; users find out when clients complain.

## Acceptance criteria

- [ ] Given entries this month have no project, when I open the month view, then a "Needs a project" list shows them, newest first.
- [ ] Given I assign a project in that list, when it saves, then the entry leaves the list without a reload.
- [ ] Given every entry has a project, when I open the month view, then the list is hidden.
- [ ] Given loading fails, when I open the month view, then the list shows "Couldn't load entries" and "Try again".

## Out of scope

- Bulk-assigning projects (new issue).

## Design notes

List sits above the calendar, collapsed to 5 rows with "Show all (n)". Reuse `ProjectSelect` per row.

## Implementation steps

1. Add `missingProject` filter to `GET /entries`, with tests. Files: `api/entries/routes.ts`
2. Add `MissingProjectSection` with its states and tests. Files: `web/entries/MissingProjectSection.tsx` (new)
3. Mount it in the month view and refresh after assignment. Files: `web/month/MonthView.tsx`

## Open questions

- Include earlier months? Default: current month only.
```
