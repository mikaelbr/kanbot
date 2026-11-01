---

name: spec-review
description: "Verify a change against its plan: every acceptance criterion with evidence, fit with the user need, scope creep and docs. Use when doing the spec/product review pass on a PR branch, or when checking whether an implementation actually does what the issue asked."
---

# Spec review

You review the change from the outside, as the user and the product owner. The question is not "is the code good?" but "did we build the right thing, completely, and nothing else?"

## 1. Criteria evidence table

For each acceptance criterion in the plan, record:

| #   | Criterion (short)              | Evidence                                                      | Verdict          |
| --- | ------------------------------ | ------------------------------------------------------------- | ---------------- |
| 1   | Missing-project entries listed | `MissingProjectSection.test.tsx` "lists entries newest first" | met              |
| 2   | Count updates after assignment | test asserts count                                            | met              |
| 3   | Section hidden when none       | no test; not observed                                         | **not verified** |

Valid evidence: a test that asserts the behaviour (read it, and check it would fail without the feature), output of the `verify` capability, or behaviour you observed by running the app or the command. The PR body's claims alone are not evidence.

"Not verified" is a finding. "Not met" is a `blocker`.

## 2. User need

Re-read the user story and problem. Then walk through the change as that user:

- Can they complete the job from where they start in the app, without knowing it was just built? Is it discoverable?
- Does the copy use their words, say what will happen, and tell them what to do on error?
- Is there feedback after every action (saving, saved, failed)?
- Any dead ends: a state with no way forward or back?
- Does it solve the problem in the plan, or only satisfy the letter of the criteria?

## 3. Scope

- Diff against the plan's implementation steps: files changed that no step explains?
- Features, options or settings nobody asked for?
- Anything listed under `## Out of scope` that was built anyway?
- Unrequested refactors or renames mixed in?

Scope creep is `major` when it adds risk or review burden, `minor` otherwise. Ask for it to be removed or moved to a follow-up issue.

## 4. Docs and communication

- User-facing behaviour changed: are help text, README, changelog or docs updated where the project keeps them?
- Does the PR body explain how to test, with steps a human can follow?
- For exploratory variants: does the PR say which approach it implements, and does it actually follow that approach?

## Writing findings

Quote the criterion or plan line, state what you observed and your evidence, and say what would satisfy it:

> Criterion 3 ("Given all entries have a project … the section is not shown") has no test and no other evidence. Add a test for the empty case.

Lead the summary with the tally ("4/5 criteria met, 1 not verified") so a human can scan it.
