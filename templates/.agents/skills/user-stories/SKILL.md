---

name: user-stories
description: Write issues and plans as user stories framed around a user need, with Given/When/Then acceptance criteria. Use when writing or rewriting an issue, a plan's user story or acceptance criteria, a new issue proposed from a split, or a `technical` goal; also when an issue reads like a feature list or prescribes a solution.
---

# User stories

A story describes a change in what a person can do, and why it matters to them. It is a promise of a conversation, not a specification. The plan's other sections hold the detail.

## Format

```markdown
As a <specific user in a specific situation>,
I want <capability, phrased as what they can do, not UI widgets>,
so that <the outcome they care about>.
```

- **Who**: a role in context, not "user". "A team lead reviewing last week's time entries", not "an admin".
- **Want**: a capability. "see which entries are missing a project", not "a red badge on the table row".
- **So that**: the real outcome. If it restates the want ("so that I can see entries"), dig one level deeper ("so that invoices go out on Monday without manual checks").

## Find the need first

Before writing the story, answer these for yourself; put the essence in the plan's one-line `Need:`:

1. Who is struggling, and in what situation does it happen?
2. What are they trying to get done (the job)? Use the Jobs-to-be-done lens: _When <situation>, I want to <motivation>, so I can <expected outcome>._
3. What do they do today instead (workaround), and what does that cost them (time, errors, risk)?
4. How will we know it worked (observable signal)?

If the issue only states a solution ("add export to CSV"), work backwards: who needs the data outside the app, and for what? The real need might be met by something smaller.

## Acceptance criteria

Write as checkboxes in Given/When/Then. Each criterion is one observable behaviour a reviewer can verify from the PR (via a test, a screenshot, or running it).

```markdown
- [ ] Given I have time entries without a project, when I open the week view, then those entries are listed under "Needs a project" with a count.
- [ ] Given all entries have a project, when I open the week view, then no "Needs a project" section is shown.
- [ ] Given the entries fail to load, when I open the week view, then I see an error with a "Try again" action.
```

Rules:

- Cover the happy path, the empty case, the error case and invalid input. Add permission cases when access differs by role.
- Use concrete values where they matter ("more than 50 items", "within 2 seconds on the seeded dataset").
- Describe behaviour, not implementation: no table names, component names or endpoints in criteria.
- Banned words without a measure: fast, easy, intuitive, user-friendly, properly, robust, support, handle, seamless.
- 3 to 7 criteria. More than 7 usually means the story should be split (see `issue-splitting`).

## The `technical` exception

When the issue has the `technical` label (refactor, infra, tooling, CI, dependency work), replace the story with a technical goal. It still names who benefits.

```markdown
## Technical goal

Move session storage from in-memory to Redis
so that the API can run on more than one instance
which unblocks zero-downtime deploys for the ops team.
```

Acceptance criteria for technical work are verifiable outcomes: "Given two API instances behind the load balancer, when a user logs in on one, then requests routed to the other are authenticated", "CI build time stays under 6 minutes", "no change in public API responses (contract tests pass)".

Do not use `technical` to dodge user framing. If users will notice the change, it is a story.

## Anti-patterns

| Smell                   | Example                                      | Fix                                                       |
| ----------------------- | -------------------------------------------- | --------------------------------------------------------- |
| Feature list            | "Add filters, sorting, export and bulk edit" | One story per user outcome; split the rest.               |
| Solution in story       | "I want a modal with a dropdown"             | State the capability; put UI ideas in Design notes.       |
| System as user          | "As the system, I want to cache…"            | Use `technical` with a technical goal, or find the human. |
| Hollow "so that"        | "so that I can use the feature"              | Ask "why?" until you reach an outcome.                    |
| Untestable criteria     | "The page is intuitive"                      | Name the observable behaviour.                            |
| Horizontal slice        | "Build the database tables for X"            | Slice vertically through UI → API → data.                 |
| Epic disguised as story | 10+ criteria, many screens                   | Split with `issue-splitting`.                             |

## New issues you propose

Bodies of new issues follow the same format: the story, a one-line need, and draft acceptance criteria. Mark anything you assumed with "Assumption:".
