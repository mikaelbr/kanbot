---

name: project-memory
description: Lessons learned in this repo, mostly from human corrections on PRs. Read before planning, implementing, reviewing or fixing. Write to it when a human correction reveals a rule you'd otherwise break again.
---

# Project memory

Facts later agents need and can't see in the code: why a choice was made, a gotcha, a correction the human gave once and shouldn't have to give again. Commands and setup belong in `project-conventions`; this skill holds what the team _learned_.

## Read

Scan the index below. Open a fact when its line bears on your task. A fact the human wrote or merged outranks your own judgement, but not the plan or the human's comments on the current issue or PR.

## Write

Add a fact when a human correction on your issue or PR shows a **lesson** that applies beyond this change. One-off details of the task are not lessons.

1. Check the index for a fact that covers it. Update that file instead of adding a second one.
2. Create `facts/<short-kebab-slug>.md`:

   ```markdown
   <The rule, one or two sentences.>

   **Why:** <the reason the human gave, with a link to the PR or issue comment.>
   ```

3. Add one line to the index: `- [<slug>](facts/<slug>.md): <the rule in a few words>`.
4. Commit it on your branch as its own commit (`docs(memory): …`) and mention it in the PR description. The human approves it by merging.

Agents that don't edit files (planners, reviewers) suggest the fact in their summary instead.

## Keep it true

A fact the code now contradicts is **stale**. If you edit files, fix or delete it in your branch. If you review, a stale fact is a `minor` finding.

## Index

<!-- One line per fact, newest last. -->
