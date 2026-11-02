---

title: Capturing ideas
description: File ideas on the board, or talk them through with your agent first.
slug: capturing-ideas
---

# Capturing ideas

Every card starts as an issue in **Ideas**. The easiest way is to add it straight to the board. If the idea is still fuzzy, the `kanbot-idea` skill helps you shape it first.

## On the board

1. Open the project board and go to the **Ideas** column.
2. Click **+ Add item**, then **+** → **Create new issue**.
3. Pick the repo and the **User need** or **Technical task** template.
4. Write the issue and create it. It lands in **Ideas**.

Create an issue, not a draft item. Agents only work on issues.

No agent touches Ideas. When you're ready, drag the card to **Planning**.

## With your agent

If you're not sure what the idea is yet, talk it through. The `kanbot-idea` skill asks you questions until the idea is clear, checks for duplicates, and files the issue for you.

1. Tell your agent about the idea, in Claude Code or Codex:

   > I have an idea for the board: users should be able to export their data.

2. The agent asks one question at a time, each with its best guess, until it can state who needs what, and why. It focuses on the problem. The planner designs the solution later.
3. It searches open issues for duplicates and asks before filing a near-copy.
4. It shows you a draft, written in the same shape as your issue templates. Nothing is filed until you say yes.
5. It files the issue. The board's auto-add workflow puts it in **Ideas**.

The skill only creates the issue, so it needs no extra setup. It uses the GitHub access you already have.

### In this repo

`kanbot init` installs the skill in `.agents/skills/kanbot-idea/`, so it works in any agent session in the repo. The target repo is read from `.kanbot/config.yml`.

### From any directory

Install the skill for your user, so it works outside the repo too:

```sh
kanbot skills install                     # Claude Code and Codex
kanbot skills install --provider claude   # just one
```

It goes to `~/.claude/skills/` and `~/.agents/skills/`. Outside a kanbot repo, name the repo ("file this on acme/app") or the agent asks. Rerun the command after upgrading kanbot.

### GitHub access

The skill uses the first that works:

1. **`gh` CLI**, logged in.
2. **GitHub MCP server**, if your agent has it. GitHub's hosted server works in Claude Code, Claude Desktop and Codex with a personal access token.
3. **Neither:** the agent writes the issue as markdown for you to paste into GitHub.

## From your phone

The skill needs an agent with GitHub access, and that isn't verified for claude.ai or ChatGPT on mobile. On the go, use GitHub Mobile: **New issue**, pick the **User need** or **Technical task** template, and write it. Auto-add puts it in **Ideas** like any other issue.

The board's **Auto-add to project** and **Item added to project → Ideas** workflows must be on. `kanbot doctor` checks them.
