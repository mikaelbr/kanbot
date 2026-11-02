---

title: Identity and merging
description: Who kanbot talks as on GitHub, and merging PRs by approving them.
slug: identity
---

# Identity and merging

kanbot can talk on GitHub as you, or as its own GitHub App. Either way, code is always yours: commits are made and signed with your git setup and pushed with your credentials.

## The two modes

|                                      | `user` (default)                 | `app`                            |
| ------------------------------------ | -------------------------------- | -------------------------------- |
| Comments, plans, replies, reactions  | Your account, signed `🤖 kanbot` | `<app>[bot]`, with a `bot` badge |
| Opens PRs, edits PR and issue bodies | Your account                     | `<app>[bot]`                     |
| Labels                               | Your account                     | `<app>[bot]`                     |
| Commits and pushes                   | You                              | You                              |
| Board moves                          | You                              | You                              |
| Merges (with `merge.onApproval`)     | You                              | You                              |
| GitHub notifies you about agent work | No                               | Yes                              |
| You can approve kanbot PRs           | No (you opened them)             | Yes                              |
| Setup                                | None                             | Two clicks, once per user or org |

### User mode

kanbot posts with your `gh` login. Its comments start with a small `🤖 kanbot` line, and hidden markers tell kanbot which comments are its own. GitHub doesn't notify you about your own activity, so kanbot sends [its own notifications](./10-configuration.md#notifications).

## App mode

kanbot posts as a GitHub App you own, so the conversation reads as kanbot talking to you. You get the usual benefits of a second participant:

- **Clear authorship.** Anything from `<app>[bot]` is kanbot. Anything else is a human.
- **GitHub notifications.** Plans, replies and review results reach your GitHub inbox. When agent review is done, kanbot requests your review, so the PR shows up in your review queue.
- **Approvals.** The app opened the PR, so you can approve it. With [`merge.onApproval`](#merge-on-approval), approving merges it.

Board moves stay on your account, since GitHub Apps can't use Projects owned by a personal account.

### Set it up

```sh
kanbot app create
```

1. A browser page opens and sends you to GitHub with the app settings filled in. Click **Create GitHub App**. Rename it first if the name is taken.
2. kanbot saves the app's private key in `~/.kanbot/apps/<id>.pem` and sets `identity` in `.kanbot/config.yml`.
3. The install page opens. Install the app on the repo, or on all repos you'll use kanbot in.
4. Commit `.kanbot/config.yml`, run `kanbot doctor`, and restart the daemon.

For a repo owned by an organization, the app is created in that organization. You need to be an owner there, or ask one to run it.

The app asks for issues and pull requests (write), and contents and metadata (read). It has no webhook. kanbot asks GitHub for a token scoped to the one repo, valid for an hour.

### Config

```yaml
identity:
  mode: app # user | app
  app: { id: 123456, slug: kanbot-acme }
```

Set `mode: user` to go back to posting as yourself. The app stays installed and can be switched back on.

### Use the app in another repo

One app can serve all your repos. In the other repo:

```sh
kanbot app link --id 123456 --slug kanbot-acme
```

Then add the repo to the app's installation (github.com/apps/&lt;slug&gt;/installations/new). On another machine, copy `~/.kanbot/apps/<id>.pem` there too. Never commit the key.

### Avatar

The manifest can't set an image. Upload one in the app's settings on GitHub, e.g. `docs/public/icon-512.png`.

## Merge on approval

```yaml
merge:
  onApproval: true
  method: squash # squash | merge | rebase
```

kanbot merges a PR when all of these hold:

- it's a kanbot PR (`kanbot/*` branch). PRs labeled `kanbot-review` are never merged.
- agent review is done (`agent-reviewed`),
- a collaborator with write access approved the PR's latest commit,
- no collaborator has an open change request,
- checks passed, or there are none,
- it has no conflicts and no `needs-human` label.

The merge uses your account, so `main` holds only your commits and merges. kanbot passes the approved commit to GitHub, so anything pushed after your approval is never merged unseen. A new push needs a new approval.

Approving with a comment counts as feedback first: the fixer answers it, and kanbot merges after, if the commit didn't change.

If the merge fails, for example because of a branch rule, the issue gets `needs-human` with the error. Remove the label to retry. You can always press the merge button yourself instead.

### Which mode it needs

You can't approve a PR you opened. In user mode, kanbot opens PRs as you, so only another collaborator can approve them. To approve your own kanbot PRs, use app mode.

With `explore:N`, approve the approach you want. kanbot merges it, and the `kanbot-merged` workflow closes the others.

### Branch rules

Merging works on any plan, without branch protection. If you add rules:

- **Require approvals** works well with app mode.
- **Don't** turn on "Require approval of the most recent reviewable push". Your account pushes kanbot's commits, so it blocks your own approval.
