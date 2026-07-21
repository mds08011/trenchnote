# Releasing TrenchNote

How a release is cut. Short on purpose: TrenchNote has no build step and no
package to publish — a "release" is a **git tag** plus the confidence that the
tagged commit reproduces from scratch and runs in production.

TrenchNote uses [semantic versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

- **MAJOR** — a change that breaks a self-hoster's existing data or a
  documented API contract (`docs/API.md`), or that requires manual migration
  steps beyond `git pull` + restart.
- **MINOR** — a new feature or collection that applies cleanly on top of the
  previous release (migrations auto-apply, old data is untouched).
- **PATCH** — a bug fix or doc correction with no schema or contract change.

## The checklist

Run these in order. Do not tag until every box is green.

1. **The tree is clean and on `main`.**
   ```sh
   git switch main && git pull && git status
   ```

2. **The regression gate passes.** This is the gate — a red smoke test is a
   blocked release, no exceptions.
   ```sh
   ./scripts/smoke_test.sh          # must print "87 passed, 0 failed" (or more)
   ```
   It boots a throwaway PocketBase from `pb_migrations/`, seeds through the
   public API, and asserts the invariants. See
   [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md#the-smoke-test--the-regression-gate).

3. **`pb_public/sw.js` `VERSION` was bumped for every `pb_public/` change since
   the last tag.** Without the bump, phones keep serving the old shell from
   cache. Confirm the current value and that it changed if any page, script, or
   the service worker itself did:
   ```sh
   git diff --name-only <last-tag>..HEAD -- pb_public/   # any output here...
   grep "const VERSION" pb_public/sw.js                  # ...means this must have moved
   ```

4. **The pinned PocketBase version is truthful.** The tested-against version
   appears in `docs/API.md`, `README.md`, `docs/DEPLOY.md`, and
   `docs/DEVELOPER_GUIDE.md`. If you moved it, all four must agree, and the
   binary in the repo root should match (`./pocketbase --version`). A binary
   bump gets the rehearsal treatment in
   [docs/RUNBOOK.md](docs/RUNBOOK.md#update-pocketbase-or-trenchnote-safely)
   first.

5. **The status docs describe the commit being tagged.** Update the snapshot
   line and review date in [docs/current-state.md](docs/current-state.md), and
   anything in `README.md` / `docs/` that a new feature made stale. Per the
   docs-as-code rule (`CLAUDE.md`), these edits land in the **same commit** as
   the code they describe — so for a release they land in the release-prep
   commit, before the tag.

6. **Write the release notes for a self-hoster.** Notes answer: what this
   release is, which PocketBase version it is pinned to, how to upgrade, and
   where the backup/rollback procedure lives (always point at
   [docs/RUNBOOK.md](docs/RUNBOOK.md)). Keep them in the annotated tag message
   so `git show <tag>` is self-contained; mirror them into the GitHub release
   if one is published. A patch release can be terse; a minor/major release
   lists the new collections/pages and any migration a self-hoster will see
   auto-apply.

## Cutting the tag

Annotated tag (never lightweight — the message *is* the release notes):

```sh
git tag -a v1.2.3 -F release-notes-v1.2.3.txt   # or -m "..." for a short note
git show v1.2.3                                  # verify the notes read right
git push origin v1.2.3                           # publishes the tag
```

Pushing the tag is the point of no return for downstream self-hosters who pin
to tags — do it only after the checklist is green and the notes are final. If a
GitHub release is desired, create it from the pushed tag and paste the same
notes.

## After the tag: sync the deployment

A tag that never reaches production leaves "the public deployment may lag
`main`" true. Bring the live box to the new tag using the rehearsal-first
procedure — **backup, rehearse the rollback on staging, then update** — in
[docs/DEPLOY.md](docs/DEPLOY.md) and
[docs/RUNBOOK.md](docs/RUNBOOK.md#update-pocketbase-or-trenchnote-safely). Only
once production serves the tag (check `sw.js` `VERSION` and a new collection
over the live API) is the release truly done.

## If a release goes wrong

Roll the deployment back first (restore the pre-update backup per the RUNBOOK),
then fix forward on `main` and cut a new PATCH tag. Do not move or delete a
pushed tag — a tag someone may have already pulled must stay pointing where it
did; supersede it instead.
