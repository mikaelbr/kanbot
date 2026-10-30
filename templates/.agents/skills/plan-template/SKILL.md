---

name: plan-template
description: The exact markdown structure for an autogh issue plan, with an example. Use whenever writing, revising or critiquing a plan in the Planning column, or when an implementer or reviewer needs to know which plan section holds what.
---

# Plan template

The plan is stored in the issue body and is the contract for the implementer and both reviewers. Write it so an agent that cannot ask questions builds the right thing. Use these headings, in this order, with these exact names. Omit `## Approaches` unless the issue has an `explore:N` label. Never omit the others; write "None." if a section is empty.

```markdown
## User story

As a <user in context>, I want <capability>, so that <outcome>.
<!-- For issues labelled `technical`, use "## Technical goal" instead, naming who benefits. -->

## Problem / user need

<What hurts today, for whom, in which situation. The current workaround and its cost. How we will know it worked. 3-6 sentences. Mark assumptions with "Assumption:".>

## Acceptance criteria

- [ ] Given <context>, when <action>, then <observable result>.
- [ ] …  <!-- 3-7 items; happy path, empty, error, invalid input, permissions -->

## Out of scope

- <Things a reader might expect but this slice does not do, and where they went (new issue / later).>

## Design notes

<For UI: the flow step by step, where it lives in the app, copy for key labels and messages, and every state: loading, empty, error, success, disabled, long content, mobile (390px) and desktop. Keyboard and screen-reader behaviour.
For non-UI: API shape (request/response examples), data model changes, error responses, compatibility.>

## Implementation steps

1. <Small atomic step that leaves the code working.> Files: `path/a.ts`, `path/b.test.ts`
2. …
<!-- 3-8 steps. Each one could be its own commit. Tests come with or before the code they cover. -->

## Test plan

- <Which tests cover which criterion (unit / integration / e2e), and what is checked by screenshot.>
- Commands: `<narrow test command>`, `<full suite>`

## Approaches

<!-- Only with explore:N. Exactly N, see the approach-designer skill. -->

## Open questions

- <Only questions the human must answer; each also listed in the output `questions`. The plan states the default it assumes until answered.>
```

## Rules

- Acceptance criteria are shared by all approaches. Approach-specific implementation steps go inside each `### Approach k` section; the top-level `## Implementation steps` then holds only steps common to all approaches, or "See each approach."
- File paths in steps come from actually reading the code (via `explorer`), not guesses. Mark new files as "(new)".
- No code blocks longer than ~10 lines; the plan is about what and why, the implementer decides the code.
- Keep the whole plan under ~120 lines (excluding approaches). Longer means split.

## Example

```markdown
## User story

As a freelancer sending invoices at the end of the month, I want to see which time entries have no project, so that I can fix them before invoicing instead of finding gaps after the invoice is sent.

## Problem / user need

Entries without a project are silently excluded from invoices. Users discover this when a client questions a low invoice. Today they scroll the whole month looking for blank project cells, which takes 10+ minutes and misses entries. Success: users fix missing projects before generating invoices; support tickets about "missing hours" drop.
Assumption: only the current user's own entries are shown.

## Acceptance criteria

- [ ] Given I have entries this month without a project, when I open the month view, then a "Needs a project" section lists them with date, duration and description, newest first.
- [ ] Given I assign a project to an entry in that section, when the save succeeds, then the entry leaves the section and the count updates without a page reload.
- [ ] Given all entries have a project, when I open the month view, then the section is not shown.
- [ ] Given loading entries fails, when I open the month view, then the section shows "Couldn't load entries" with a "Try again" button.

## Out of scope

- Bulk-assigning a project to several entries (proposed as a new issue).
- Warning on the invoice screen (separate idea).

## Design notes

Section sits above the calendar grid, collapsed to 5 rows with "Show all (12)". Each row has a project picker (reuse `ProjectSelect`). Loading: 3 skeleton rows. Error: inline message plus retry, rest of the page still usable. Mobile: rows stack date over description; picker full width. Picker is keyboard operable; count change announced via a polite live region.

## Implementation steps

1. Add `GET /entries?month=&missingProject=true` filter with tests. Files: `api/entries/routes.ts`, `api/entries/routes.test.ts`
2. Add `useEntriesMissingProject(month)` hook. Files: `web/entries/hooks.ts`
3. Build `MissingProjectSection` with loading/empty/error states and tests. Files: `web/entries/MissingProjectSection.tsx` (new), `…test.tsx` (new)
4. Mount it in the month view and wire project assignment to refresh the list. Files: `web/month/MonthView.tsx`

## Test plan

- API filter: integration test (criteria 1, 3).
- Section states and assignment: component tests (criteria 1-4).
- Screenshots at 390/1280: with entries, empty (hidden), error.
- Commands: `bun test web/entries`, `bun test`

## Open questions

- Should entries from previous months show too? Default: current month only.
```
