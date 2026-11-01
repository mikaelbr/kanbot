---

title: Providers
description: Run agents with Claude Code or Codex.
slug: providers
---

# Providers

kanbot runs agents with either Claude Code or Codex. Both use your subscription login, not API keys.

## Choose a provider

Pick one at setup:

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

Each job runs `codex exec`. Agents with `edit` or `bash` tools get a `workspace-write` sandbox; others get `read-only`.

Workers ignore `~/.codex/config.toml`: no user plugins, MCP servers, default model or other settings. The model comes from the agent's frontmatter, and MCP servers from the repo's `.mcp.json` (stdio and HTTP; not `sse`). Login still comes from `~/.codex`.

Network access is off by default. Turn it on if agents need to install packages:

```yaml
codex:
  networkAccess: true
```

## Models and effort

Set models per agent and provider in the agent's frontmatter. See [Agents](./06-agents.md#frontmatter).

```yaml
models: { claude: opus, codex: default }
effort: high
```

`codex: default` uses Codex's built-in default model, not the one in your `~/.codex/config.toml`. Codex has no `max` effort, so `max` maps to `xhigh`.

## Rate limits

When a job hits a usage limit, the daemon pauses and resumes later. `kanbot status` shows the pause.
