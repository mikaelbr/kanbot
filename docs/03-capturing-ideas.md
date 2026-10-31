---

title: Capturing ideas
description: File ideas from a chat with your agent, from any directory, or from your phone.
slug: capturing-ideas
---

# Capturing ideas

Every card starts as an issue in **Ideas**. You can write it in GitHub, but often it's easier to talk it through first. The `kanbot-idea` skill does that: it asks you questions until the idea is clear, checks for duplicates, and files the issue for you.

## How it works

1. Tell your agent about the idea, in Claude Code or Codex:

   > I have an idea for the board: users should be able to export their data.

2. The agent asks one question at a time, each with its best guess, until it can state who needs what, and why. It focuses on the problem. The planner designs the solution later.
3. It searches open issues for duplicates and asks before filing a near-copy.
4. It shows you a draft, written in the same shape as your issue templates. Nothing is filed until you say yes.
5. It files the issue. The board's auto-add workflow puts it in **Ideas**.

No agent touches Ideas. When you're ready, drag the card to **Planning**.

The skill only creates the issue. That's why it needs no extra setup: it uses the same GitHub access you already have.

## In this repo

`kanbot init` installs the skill in `.agents/skills/kanbot-idea/`, so it works in any agent session in the repo. The target repo is read from `.kanbot/config.yml`.

## From any directory

Install the skill for your user, so it works outside the repo too:

```sh
kanbot skills install                     # Claude Code and Codex
kanbot skills install --provider claude   # just one
```

It goes to `~/.claude/skills/` and `~/.agents/skills/`. Outside a kanbot repo, name the repo ("file this on acme/app") or the agent asks. Rerun the command after upgrading kanbot.

## GitHub access

The skill uses the first that works:

1. **`gh` CLI**, logged in.
2. **GitHub MCP server**, if your agent has it. GitHub's hosted server works in Claude Code, Claude Desktop and Codex with a personal access token.
3. **Neither:** the agent writes the issue as markdown for you to paste into GitHub.

## From your phone

The skill needs an agent with GitHub access, and that isn't verified for claude.ai or ChatGPT on mobile. On the go, use GitHub Mobile instead: **New issue**, pick the **User need** or **Technical task** template, and write it. Auto-add puts it in **Ideas** like any other issue.

The board's **Auto-add to project** and **Item added to project → Ideas** workflows must be on. `kanbot doctor` checks them.
