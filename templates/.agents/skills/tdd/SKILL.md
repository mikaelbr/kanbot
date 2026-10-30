---

name: tdd
description: Test-driven development loop for agents (red, green, refactor) driven by acceptance criteria. Use when implementing a planned change, fixing a bug or review finding, or refactoring; covers which tests to write, running the narrowest test command first, and never weakening tests to make them pass.
---

# TDD for agents

Tests are how you prove to the reviewers, and to yourself, that each acceptance criterion holds. Write them first so they test the behaviour you were asked for, not the code you happened to write.

## Loop

1. **Pick one criterion** (or one finding, for fixes). Work on one at a time.
2. **Red.** Write a test that expresses it through the public interface (rendered UI, HTTP endpoint, CLI, exported function). Run it with the narrowest command. Confirm it fails **on the assertion**, for the reason you expect. A failure from an import error, typo or missing fixture is not red yet; fix the test.
3. **Green.** Write the simplest production code that makes it pass. Run the narrow command again.
4. **Refactor.** Remove duplication and clarify names while the test stays green. Keep refactors in the code you just touched.
5. **Commit** test and code together (`feat: …`, `fix: …`), then move to the next criterion.
6. After all criteria: run the full suite, lint and typecheck once.

## Running tests efficiently

- Narrowest first: a single file or test name (`bun test path/to/file.test.ts -t "name"`, `npx vitest run file -t name`, `pytest path::test_name`, `go test ./pkg -run TestName`). Use the commands in `project-conventions`.
- Full suite only after the narrow tests pass, and before you finish.
- When a test is slow because of setup, still run it; do not replace it with a weaker unit test.
- Read failure output fully. The first error is usually the real one.

## What to test

- Each acceptance criterion: at least one test, named after the behaviour.
- Unhappy paths named in the plan: invalid input, empty data, failures from dependencies, permission denied.
- For bugs: a regression test that reproduces the bug and fails before the fix.
- For refactors: characterization tests that pass before and after; behaviour must not change.

Mock only at boundaries you do not own (network, clock, randomness, third-party services). Mocking your own modules makes tests pass while the integration is broken.

## When the test is hard to write

- Hard to set up usually means the design is too coupled. Introduce a seam (pass the dependency in) rather than reaching into internals.
- Purely visual criteria (layout, colour) are verified by screenshot (`verify-ui`), not by snapshot tests of markup.
- If a criterion genuinely cannot be tested automatically, say which and why in the PR body's "How to test".

## Never

- Weaken an assertion, add `.skip`/`xit`/`@pytest.mark.skip`, delete a test, or loosen a type or lint rule to get green.
- Change a test's expected value to match the code's output without first confirming the code is right and the test was wrong. If so, explain it in the commit message.
- Leave `only`/`focus` markers or debug output in committed tests.
- Claim tests pass without having run them in this session. Report the actual command and result in `testsRun`.

## If the existing suite is already red

Run it before you change anything. Record pre-existing failures, make sure you add none, and list them in `risks`. Do not fix unrelated failures unless the plan asks.
