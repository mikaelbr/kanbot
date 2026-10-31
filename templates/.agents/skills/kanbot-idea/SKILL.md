---

name: kanbot-idea
description: Turn an idea into an issue on a kanbot board. Use when the human wants to capture, explore or file an idea, feature or task for kanbot agents to plan later.
---

# kanbot idea

Help the human shape an idea, then file it as a GitHub issue. The board's auto-add workflow puts new issues in **Ideas**, where no agent touches them. Planning happens later, when the human drags the card to **Planning**.

You shape the _problem_. The planner agent designs the solution later.

## 1. Find the repo

Use the repo the human names. Otherwise read `repo:` from `.kanbot/config.yml` in the current directory. Otherwise ask.

GitHub access: `gh` if it is installed and logged in, else the GitHub MCP server's issue tools. If neither works, write the finished issue as markdown for the human to paste.

## 2. Shape it

Decide the kind with the human:

- **User need**: who needs what, and why. The default.
- **Technical**: refactoring, tooling, infra. What should be true when done, and who benefits.

Ask one question at a time, each with your best guess, until you can write the need (or goal) in two or three plain sentences, plus constraints and links. Capture what the human already knows about solutions as notes, not as the plan.

If it is really several ideas, propose one issue each.

## 3. Check for duplicates

Search open issues with the idea's key terms (`gh issue list --repo <repo> --search "<terms>"`). If one is close, show it and ask: add a comment there instead, or file a new one?

## 4. Draft

Match the repo's issue template, so the issue reads like one filed through GitHub. Read `.github/ISSUE_TEMPLATE/user-story.yml` or `technical.yml` from the repo (locally, or with `gh api repos/<repo>/contents/<path>`). Use each field's `label` as a `### ` heading and put the answer under it. Without templates:

```markdown
### Who needs what, and why?        (technical: ### Goal)

<two or three sentences>

### Notes, constraints, links

<notes, or _None._>
```

Title: the outcome in under 70 characters. Technical issues get the `technical` label. Leave `type:*` labels to the planner.

Show the title and body. File it only after the human says yes.

## 5. File it

`gh issue create --repo <repo> --title "<title>" --body-file <file>` (add `--label technical` when it applies), or the MCP equivalent.

Done when the issue exists and the human has its link. Tell them it is in **Ideas**, and that dragging it to **Planning** starts the planner.
