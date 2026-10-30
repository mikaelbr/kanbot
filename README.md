# autogh

Run an autonomous dev team from a GitHub Project board. You manage the board like a product manager; Claude Code or Codex agents plan, implement, review and fix, using your existing **subscription** (Claude Max/Pro or ChatGPT). No API keys.

```
Ideas ──► Planning ──► Ready ──► In Progress ──► Review ──► Done
 you      agent plans   you       agents build    2 agent     you merge
 write    you comment   approve   (≤3 parallel)   reviews,
          agent revises (drag)                    you test, comment → agent fixes
```

## How it works

| Column          | What happens                                                                                                                                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ideas**       | Nothing. Your backlog and notes.                                                                                                                                                                                                                                                                                |
| **Planning**    | The `planner` agent writes a plan into the issue body (user story, acceptance criteria, small atomic steps). Comment to steer it: it reacts 👀, revises the plan, replies to each comment, reacts 👍. It can split work into sub-issues. Label `explore:2`–`explore:4` to get that many alternative approaches. |
| **Ready**       | Dragging a card here **is** the approval. Cards are picked top-down when a worker is free.                                                                                                                                                                                                                      |
| **In Progress** | An implementer agent (chosen by `type:*` label) builds it in its own git worktree, runs tests, and autogh opens the PR. `explore:N` issues get N PRs, one per approach; each one uses a worker. Max `concurrency` (default 3) workers in total.                                                                 |
| **Review**      | Agent review pass 1 (`reviewer-code`) → fix → pass 2 (`reviewer-spec`, acceptance criteria and UX) → fix → label `agent-reviewed` and a notification. Leave PR comments or review threads and the `fixer` addresses them, replies, and resolves the threads. Failing CI is fixed too.                           |
| **Done**        | You merge. `Closes #n` closes the issue and the board's built-in workflow moves it. For exploratory issues, a GitHub Action closes the other approaches' PRs.                                                                                                                                                   |

### Design principles

- **The orchestrator is deterministic code, not an LLM.** A Bun daemon polls the board, decides what to do in a pure function (`src/daemon/derive.ts`) and runs one headless CLI process per job (`claude -p` / `codex exec`).
- **GitHub is the state.** Columns, labels, and hidden `<!-- autogh:… -->` markers in comments. You can kill and restart the daemon at any time. The only local state is failure counts.
- **Agents never touch GitHub.** Workers get no token, and `gh` and `git push` are denied. They return validated JSON (`--json-schema` / `--output-schema`), and the daemon applies every comment, label, push and PR. This keeps runs auditable, idempotent and harder to hijack through prompt injection.
- **Only collaborators with write access can steer agents.** Comments from anyone else are ignored.
- **Agents act as your gh account.** So:
  - Everything autogh posts carries a marker, which is how it tells your comments from its own.
  - You approve by merging, since you can't approve your own PR.
  - GitHub won't notify you about your "own" activity, so autogh sends desktop notifications and/or calls a webhook (e.g. ntfy.sh).

## The agent layer

```
Tier 1  Orchestrator (Bun daemon)  board → jobs → worker slots → GitHub side effects
Tier 2  Column agents   planner · implementer-{frontend,backend,docs,technical} · reviewer-code · reviewer-spec · fixer
Tier 3  Subagents       explorer · test-writer · ui-verifier · plan-critic · approach-designer
        Skills          user-stories · issue-splitting · plan-template · tdd · code-review · spec-review ·
                        frontend-design · verify-ui · accessibility · pr-description · project-conventions
```

- **Agents** live in `.autogh/agents/*.md`, one file per agent. Each file has frontmatter: `tier`, `models` per provider, `effort`, `tools`, `skills`, `subagents`, and `output` schema.
- `autogh sync` generates each CLI's native format from them:
  - `.claude/agents/*.md` and `.claude/settings.json` (permissions)
  - `.codex/agents/*.toml`

  Edit the source and re-sync. Never edit the generated files.
- **Skills** use the open `SKILL.md` format in `.agents/skills/`. Codex reads that folder directly, and `.claude/skills` is a symlink to it.
- **Tuning over time** happens through pull requests to `.autogh/agents/` and `.agents/skills/`. Fill in `project-conventions` early; every agent reads it first.

## Setup

Requirements: [Bun](https://bun.sh) ≥ 1.3, `gh` (logged in, with the `project` scope), and `claude` or `codex` logged in with a subscription.

```sh
gh auth refresh -s project           # Projects v2 access
cd your-product-repo
bunx autogh init --provider claude   # or: --provider codex
autogh board create                  # project board + labels
#   then enable the board's built-in workflows it prints (Item closed → Done, PR merged → Done, Auto-add)
git add -A && git commit -m "chore: add autogh" && git push
autogh doctor
autogh run --once --dry-run          # see what it would do
autogh run                           # start the loop
```

From a clone of this repo instead of npm: `pnpm install && bun link`, then use `autogh` as above.

### Keep it running (macOS launchd)

`~/Library/LaunchAgents/dev.autogh.<repo>.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>dev.autogh.myrepo</string>
  <key>ProgramArguments</key><array><string>/Users/me/.bun/bin/autogh</string><string>run</string></array>
  <key>WorkingDirectory</key><string>/Users/me/code/myrepo</string>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/autogh-myrepo.log</string>
  <key>StandardErrorPath</key><string>/tmp/autogh-myrepo.log</string>
</dict></plist>
```

Load it with `launchctl load ~/Library/LaunchAgents/dev.autogh.myrepo.plist`. On Linux, use a systemd user service with the same command. Run one daemon per repo.

## Configuration — `.autogh/config.yml`

```yaml
provider: claude # claude | codex (one per project)
repo: owner/name
baseBranch: main
project: { owner: you, number: 7 }
concurrency: 3 # worker slots; each explore variant uses one
pollSeconds: 60
priority: [fix, review, plan, implement]
maxAttempts: 2 # then the issue gets `needs-human`
timeoutMinutes: { plan: 20, implement: 90, review: 30, fix: 45 }
implementers: # type:* label → column agent
  frontend: implementer-frontend
  backend: implementer-backend
  docs: implementer-docs
  infra: implementer-technical
  default: implementer-backend
codex: { networkAccess: false } # let codex workers install packages
notify: { desktop: true, webhook: null } # e.g. https://ntfy.sh/my-topic
columns:
  {
    ideas: Ideas,
    planning: Planning,
    ready: Ready,
    inProgress: In Progress,
    review: Review,
    done: Done,
  }
```

## Labels

| Label                                 | Meaning                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `technical`                           | Plan as a technical goal, not a user story                                         |
| `type:frontend\|backend\|docs\|infra` | Picks the implementer agent; the planner sets it                                   |
| `explore:2..4`                        | Build N alternative approaches as N PRs                                            |
| `autogh:working`                      | An agent is implementing this issue                                                |
| `agent-reviewed`                      | Passed both agent reviews; ready for you                                           |
| `needs-human`                         | Agents stopped (blocked, repeated failures, CI keeps failing). Remove it to retry. |

## Operating

- `autogh status`: column contents, daemon pid, failures, rate-limit pause.
- `.autogh/logs/*.jsonl`: the full transcript of every agent run.
- Worktrees live in `~/.autogh/worktrees/<owner>__<repo>/` and are removed when the issue closes.
- When the CLI reports a usage or rate limit, all work pauses for 30 minutes.

## Development

```sh
pnpm install
bun test          # derive() state machine, sync rendering, markers, schemas
pnpm check        # biome
pnpm typecheck
```

## Known limitations

- Ready-column priority follows the order the Projects API returns items in. Check that it matches your manual board order.
- The board's built-in workflows can't be configured through the API; `autogh board create` prints the steps.
- In-progress work doesn't survive a daemon crash. The job reruns from scratch, but pushed work is reused.
