---

title: Upgrading
description: Get new kanbot agents and skills without losing your edits.
slug: upgrading
---

# Upgrading

`kanbot init` copies agents, skills and workflows into your repo. You then make them your own. When kanbot ships improved versions, `kanbot upgrade` brings them in without overwriting your edits.

```sh
bunx kanbot@latest upgrade --dry-run   # see what would change
bunx kanbot@latest upgrade
git diff                               # review, then commit
```

Nothing is committed for you.

When the kanbot you run is newer than the one in `.kanbot/manifest.json`, other commands print a warning to run `kanbot upgrade`.

## How it knows what you changed

`init` and `upgrade` write `.kanbot/manifest.json`. It records the kanbot version and a hash of each file as kanbot installed it. On upgrade, kanbot compares three versions of each file:

- **installed**: the hash in the manifest
- **yours**: the file in your repo now
- **new**: the file in the new kanbot version

If yours still matches installed, you never edited it, so kanbot replaces it. If you edited it and the template also changed, kanbot leaves your file alone and writes the new version next to it as `<file>.kanbot-new`.

Commit the manifest. Without it, the next upgrade can't tell your edits apart.

## Who owns which file

| Owner      | Files                                                                                               | On upgrade                                      |
| ---------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **You**    | `AGENTS.md`, `CLAUDE.md`, `project-conventions`, `project-memory`, `ci.yml`, issue and PR templates | Never touched after `init`.                     |
| **kanbot** | `.github/workflows/kanbot-*.yml`, the `kanbot-*` skills                                             | Always replaced.                                |
| **Shared** | Everything else: `.kanbot/agents/*.md` and `.agents/skills/*`                                       | Replaced if unedited, else `<file>.kanbot-new`. |

Files you deleted stay deleted. Files kanbot no longer ships are listed, but left in place.

Newer kanbot versions no longer ship craft skills (`verify-ui`, `code-review`, `tdd`…). If you have them and no `capabilities` in config, `upgrade` maps them for you, e.g. `verify: verify-ui`. See [Capabilities](./05-capabilities.md).

The `implementers` config field is deprecated. While set, it still picks an agent by `type:<key>` label, and `doctor` warns. Remove it and map craft under `capabilities` instead.

After writing files, `upgrade` runs `kanbot sync`, so generated `.claude/` and `.codex/` files match.

## Merging `.kanbot-new` files

For each `<file>.kanbot-new`, keep your changes, take what's new from kanbot, then delete the `.kanbot-new` file. You can ask your agent to do it:

> Use kanbot-admin to merge the kanbot upgrade.

The [`kanbot-admin`](./07-skills.md#admin-skills) skill knows the steps. `kanbot doctor` reports any `.kanbot-new` files left over.

## Repos set up before the manifest

If there is no manifest, kanbot compares each file to every past version it has shipped. A match means unedited. Anything else is treated as edited and gets a `.kanbot-new` file. The first upgrade creates the manifest.

## Staying current

`kanbot doctor` warns when your files differ from the kanbot version you run. Fix it with `kanbot upgrade`.
