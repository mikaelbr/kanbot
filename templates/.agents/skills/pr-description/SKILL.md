---

name: pr-description
description: Template and rules for writing a pull request title and body (Summary, Why, What changed, How to test, Screenshots, Risks, Notes for reviewer). Use when filling prTitle/prBody at the end of an implementation, or whenever writing or rewriting a PR description.
---

# PR description

The reader is a busy human reviewer who has the issue open in another tab. They want to know in 30 seconds what changed and how to check it. The daemon adds the `Closes #N` line; never write one.

## Title

Conventional commit style, imperative, under 72 characters, describing the user-visible effect where there is one:

- `feat(time): show entries that are missing a project`
- `fix(auth): keep users signed in across API instances`
- `refactor(billing): extract invoice totals into a pure module`

## Body template

```markdown
## Summary

<One or two sentences: what this PR does, in user terms.>

## Why

<The user need from the plan in one or two sentences. For explore variants: "Implements Approach k: <name>.">

## What changed

- <Grouped by behaviour, not by file. 3-7 bullets.>
- <Mention new dependencies, migrations, config or env vars explicitly.>

## How to test

1. <Setup: seed data, flags, env, command to run.>
2. <Steps a human can follow, ending in what they should see.>
3. <Include one unhappy path.>

Automated: `<test command>` (<N> tests added/changed).

## Screenshots

| State  | Mobile (390px)                                   | Desktop (1280px)                                  |
| ------ | ------------------------------------------------ | ------------------------------------------------- |
| Filled | ![](.autogh/screenshots/<branch>/filled-390.png) | ![](.autogh/screenshots/<branch>/filled-1280.png) |
<!-- Omit this section when there is no UI change. -->

## Risks and rollout

- <What could break, migrations and whether they are reversible, feature flags, anything not verified.>
<!-- "None known." is acceptable when true. -->

## Notes for reviewer

- <Where to start reading, decisions you made where the plan was open, deliberate deviations from the plan and why, follow-ups you left out.>
```

## Rules

- Omit sections that are empty except Summary, Why, What changed and How to test.
- Describe what the code does now, not the journey ("first I tried…").
- Every acceptance criterion should be checkable from "How to test" or the screenshots.
- Be honest: anything you could not verify goes in Risks, not hidden.
- Link files with repo-relative paths; screenshot paths must match those listed in the `screenshots` output field.
- Keep it under ~60 lines. Long explanations belong in code comments or docs, not the PR.
