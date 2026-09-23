# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `sesamfood/ENGINE`.
Use the `gh` CLI from this repo; it infers the repository from the remote.

## Conventions

- Create: `gh issue create --title "..." --body-file <path>`
- Read: `gh issue view <number> --comments`
- Read structured data: `gh issue view <number> --json number,title,body,labels,comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --body-file <path>`
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

For multiline bodies, write the exact text to a temporary file and pass
`--body-file`. Add label and state filters when listing issues.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares issue and PR numbers. If a reference could be either, resolve
it with `gh pr view <number>` and fall back to `gh issue view <number>`.

## Skill instructions

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", run
`gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`:

- Map: one issue labelled `wayfinder:map`, containing Notes,
  Decisions-so-far, and Fog.
- Child ticket: an issue linked to the map through GitHub sub-issues
  using `gh api`. If unavailable, add it to a task list in the map and
  put `Part of #<map>` at the top of the child body.
- Ticket types: `wayfinder:research`, `wayfinder:prototype`,
  `wayfinder:grilling`, or `wayfinder:task`.
- Blocking: use native GitHub issue dependencies.
  Add a dependency with
  `gh api --method POST repos/sesamfood/ENGINE/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  Get the database ID with
  `gh api repos/sesamfood/ENGINE/issues/<blocker> --jq .id`;
  it is not the issue number or node ID.
  If dependencies are unavailable, use `Blocked by: #<n>, #<n>` at
  the top of the child body.
- Frontier: list the map's open children in map order. Skip assigned
  tickets and those with open blockers. For native dependencies,
  `issue_dependencies_summary.blocked_by` counts open blockers.
  For the fallback, check each referenced issue. Pick the first
  remaining ticket.
- Claim: `gh issue edit <number> --add-assignee @me`.
- Resolve: comment with the answer, close the ticket, then append a
  brief result and link to the map's Decisions-so-far.
