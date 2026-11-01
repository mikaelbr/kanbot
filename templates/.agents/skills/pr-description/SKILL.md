---

name: pr-description
description: Template and rules for writing a pull request title and body (Summary, What changed, How to test, Screenshots, Notes for reviewer). Use when filling prTitle/prBody at the end of an implementation, or whenever writing or rewriting a PR description.
---

# PR description

The reader is a busy reviewer with the issue open in another tab. They should know in 30 seconds what changed and how to check it. The daemon adds the `Closes #N` line, plus your `risks` and `testsRun`; don't repeat them in the body.

## Title

Conventional commit, imperative, under 72 characters, naming the user-visible effect: `feat(time): show entries that are missing a project`.

## Body template

```markdown
<One sentence: what this PR does, in user terms. Explore variants: "Approach k: <name>.">

## What changed

- <By behaviour, not by file. 1-5 bullets. Call out new dependencies, migrations, env vars.>

## How to test

1. <Steps a human follows, ending in what they should see. 1-5 steps.>

## Screenshots

![<state>](repo-relative path to a committed image)
<!-- Optional. Only when the change is visible; 1-3 images. -->

## Validation

- <What you used to prove it works (tests, skills, preview) and what it showed. 1-3 bullets.>

## Notes for reviewer

- <Only decisions or deviations from the plan the reviewer must know. Omit if none.>
```

## Rules

- One line per bullet. No "Why" section; the issue has it.
- Describe what the code does now, not how you got there.
- Anything you could not verify goes in `risks`, not the body.
- Omit Screenshots when there is nothing to show.
- Aim for under 20 lines.
