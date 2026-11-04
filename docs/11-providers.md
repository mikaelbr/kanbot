---

title: Providers
description: Run agents with Claude Code or Codex.
slug: providers
---

# Providers

kanbot runs agents with either Claude Code or Codex. Both use your subscription login, not API keys.

## Choose a provider

`kanbot init` asks, and defaults to the one you're logged in to. Or pass it:

```sh
kanbot init --provider claude   # or codex
```

Or change `provider` in `.kanbot/config.yml`:

```yaml
provider: codex
```

Restart the daemon after changing it. Agents and skills are shared, so nothing else changes.

## Claude Code

Log in with a Claude subscription:

```sh
claude auth login
```

`kanbot doctor` fails if you are logged in with an API key, since that would bill API usage.

Each job runs `claude -p` with:

- Agent definitions passed in, so runs don't depend on committed files.
- Only project settings, no user plugins, skills or MCP servers. MCP servers come from the repo's `.mcp.json`.
- The agent's tools allowed, and `gh`, `git push`, `git remote` and `git config` denied. See [Safety](./02-workflow.md#safety).
- No co-author lines on commits or PRs.

## Codex

Log in with a ChatGPT plan:

```sh
codex login
```

Each job runs `codex exec`. Agents with `edit` or `bash` tools run without a sandbox, like Claude workers; others get a `read-only` sandbox. Codex's `workspace-write` sandbox blocks `.agents`, signed commits and browsers, which agents need. See [Safety](./02-workflow.md#safety) for what still keeps them off GitHub.

Workers ignore `~/.codex/config.toml`: no user plugins, MCP servers, default model or other settings. The model comes from the agent's frontmatter, and MCP servers from the repo's `.mcp.json` (stdio and HTTP; not `sse`). Login still comes from `~/.codex`.

`codex.networkAccess` is ignored, since agents that run commands have no sandbox.

## Permissions

Workers must edit files, edit skills in `.agents/skills` and commit, but not push. Check with a real job:

```sh
kanbot doctor --probe
```

It runs a short job in a throwaway worktree, then reports what worked. Read the run with `kanbot logs probe`. `kanbot status` also shows permission errors of running agents.

- **Claude Code**: deny rules in `.claude/settings.local.json` or managed settings still apply. Remove ones that block `Edit`, `Write` or `Bash`.
- **Codex**: managed requirements from your organization can still force a sandbox. Ask whoever manages Codex for you.

## Models and effort

Set models per agent and provider in the agent's frontmatter. See [Agents](./06-agents.md#frontmatter).

```yaml
models: { claude: opus, codex: default }
effort: high
```

`codex: default` uses Codex's built-in default model, not the one in your `~/.codex/config.toml`. Codex has no `max` effort, so `max` maps to `xhigh`.

## Rate limits

When a job hits a usage limit, the daemon pauses and resumes later. `kanbot status` shows the pause.
