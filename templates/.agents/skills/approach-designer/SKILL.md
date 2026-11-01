---

name: approach-designer
description: Produce N genuinely different solution approaches for one problem, each with how it works, tradeoffs, risk and effort, plus a comparison table. Use for issues labelled explore:N, when writing a plan's "## Approaches" section, or when asked for alternatives or options to compare.
---

# Approach designer

With `explore:N`, each approach is built in parallel by its own implementer on its own branch, and a human picks one by comparing working PRs. That only pays off if the approaches are different enough that seeing them side by side teaches something.

## Make them genuinely different

Pick the axis where the decision matters most for this problem, then spread approaches across it. Useful axes:

| Axis              | Example spread for "let users find old invoices"                            |
| ----------------- | --------------------------------------------------------------------------- |
| Interaction model | Search box · faceted filters · timeline browsing                            |
| Where logic lives | Client-side filtering of loaded data · server query endpoint · search index |
| Data model        | Denormalised read model · query on existing tables · materialised view      |
| Build vs. reuse   | Build it · reuse what the project has · third-party library                 |
| Timing            | Synchronous · background job with notification · precomputed nightly        |
| Scope of change   | Minimal tweak to the current screen · new dedicated screen                  |

Two approaches are the same approach if they differ only in: naming, styling or colours, a library swap with the same model (two date-picker packages), parameter values, or the order of the same steps.

Self-test: could a human describe the difference in one sentence that mentions user experience, architecture or cost? If not, replace one.

Constraints shared by all approaches:
- Every approach meets every acceptance criterion. If it cannot, it is not an option.
- Every approach fits one small PR. A huge approach next to a small one is not a fair comparison; shrink it or drop it.
- Every approach follows project conventions unless deviating is the point of the approach (then say so).

## Format

Write exactly N sections, numbered from 1 with no gaps, then a comparison table.

```markdown
## Approaches

### Approach 1: <descriptive name>

**Summary:** <one sentence a product owner understands.>

**How it works:** <3-6 sentences: what the user experiences, then where the logic lives and what data changes.>

**Implementation steps:**
1. <step> Files: `…`
2. …

**Tradeoffs:**
- Good: <concrete benefit>
- Costs: <concrete downside: complexity, perf, UX limitation, lock-in>

**Risk:** <the main thing that could go wrong, and how likely.>  
**Effort:** S | M | L <relative to the other approaches, with a one-line reason.>

### Approach 2: <descriptive name>

…

### Comparison

|                  | Approach 1: <name> | Approach 2: <name> | …   |
| ---------------- | ------------------ | ------------------ | --- |
| User experience  |                    |                    |     |
| Complexity added |                    |                    |     |
| Performance      |                    |                    |     |
| Reversibility    |                    |                    |     |
| Effort           | S                  | M                  |     |
| Best when        |                    |                    |     |
```

## Writing good approaches

- Names describe the idea: "Inline editing", "Wizard", "Background import", not "Option A" or "Simple approach".
- Be concrete about the user experience. Implementers build what you write; vague approaches converge into the same build.
- Name real downsides. "Slightly more code" is not a tradeoff; "every list view needs a new loading state because data arrives after first render" is.
- "Best when" says which circumstances would make each approach the right choice. This is what helps the human choose.
- Do not declare a winner in the plan. A single sentence of recommendation after the table is fine if you have a clear reason.
