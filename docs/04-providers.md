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
- Only project settings, no user plugins, skills or MCP servers.
- The agent's tools allowed, and `gh`, `git push`, `git remote` and `git config` denied.
- No co-author lines on commits or PRs.

## Codex

Log in with a ChatGPT plan:

```sh
codex login
```

Each job runs `codex exec`. Agents with `edit` or `bash` tools get a `workspace-write` sandbox; others get `read-only`.

Network access is off by default. Turn it on if agents need to install packages:

```yaml
codex:
  networkAccess: true
```

## Models and effort

Set models per agent and provider in the agent's frontmatter. See [Agents](./05-agents.md#frontmatter).

```yaml
models: { claude: opus, codex: default }
effort: high
```

`codex: default` uses Codex's default model. Codex has no `max` effort, so `max` maps to `xhigh`.

## Rate limits

When a job hits a usage limit, the daemon pauses and resumes later. `kanbot status` shows the pause.
