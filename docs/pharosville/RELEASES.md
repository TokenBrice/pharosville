# PharosVille Releases

Last updated: 2026-07-25

This is the canonical runbook for versioned releases. A PharosVille version is
released only when all three records exist and agree:

1. A `CHANGELOG.md` entry mirrored by `src/content/pharosville-changelog.ts` and
   `src/content/pharosville-version.ts`.
2. A semantic Git tag (`vMAJOR.MINOR.PATCH`) on a commit from `main`.
3. A published GitHub Release created by `.github/workflows/release.yml`.

A changelog entry, merge to `main`, Cloudflare deployment, or local tag by
itself is not a versioned release.

## Non-Bypass Rules

- Do not manually run `git tag`, push a semantic version tag, or run
  `gh release create` for a normal release.
- Do not use a direct Wrangler deploy as a substitute for the protected
  release path.
- Do not add a released version to only one changelog surface.
- Do not reuse or move an existing semantic tag.
- Historical backfill is operator-only and must use the workflow operation
  documented below.

## Normal Release

1. Create a `release/vX.Y.Z` branch from current `main`.
2. Update `CHANGELOG.md`, `src/content/pharosville-changelog.ts`, and
   `src/content/pharosville-version.ts` in the release pull request.
3. Run focused checks while editing, then run:

   ```bash
   npm run check:release-contract
   npm run validate:release
   ```

4. Merge only through the protected pull request path after `typecheck`,
   `unit`, `guards`, `build`, `visual`, and `visual-cross-browser` pass.
   Required approvals are zero only while the repository has a single
   write-capable collaborator; `npm run check:branch-protection` enforces a
   viable review policy and requires approval once another reviewer exists.
5. Wait for the `Deploy to Cloudflare Pages` push run for the merge commit to
   pass, including live smoke.
6. The successful deploy automatically triggers `Publish GitHub Release`.
   That workflow reads the release declaration from the deployed commit,
   creates the annotated tag with the repository-scoped release deploy key,
   and publishes the Release with the short-lived `GITHUB_TOKEN`.
7. Verify the workflow and public state:

   ```bash
   npm run check:github-releases
   npm run smoke:live -- --url https://pharosville.pharos.watch
   ```

The workflow is idempotent. A rerun verifies an existing matching tag or
release instead of creating a duplicate.

## Recovery

If the deploy passed but the automatic release job failed, dispatch the same
workflow against `main` with the deployed merge SHA:

```bash
git fetch origin main
target=<deployed-main-sha>
gh workflow run release.yml \
  --repo TokenBrice/pharosville \
  --ref main \
  -f operation=publish \
  -f tag=vX.Y.Z \
  -f target="$target"
```

The recovery path still requires a successful production deploy run for the
exact target SHA.

## Historical Backfill

Use this only when a version is already documented in the changelog but
predates the automated workflow. Select the last commit in that entry's
documented source range and dispatch:

```bash
gh workflow run release.yml \
  --repo TokenBrice/pharosville \
  --ref main \
  -f operation=historical-backfill \
  -f tag=vX.Y.Z \
  -f target=<documented-boundary-sha>
```

The workflow marks the notes as a historical backfill, creates the tag and
Release, and does not mark the backfill as Latest. It still requires the target
to be an ancestor of `main` and refuses to move a pre-existing tag.

After all backfills complete, run the explicit remote audit:

```bash
gh workflow run release.yml \
  --repo TokenBrice/pharosville \
  --ref main \
  -f operation=audit
npm run check:github-releases
```

The same audit runs daily and fails when the changelog, semantic tags, or
published GitHub Releases diverge.

## Release Credential

GitHub's workflow token cannot create a tag that exposes commits containing
workflow files because it cannot request the separate Workflows permission.
Release publication therefore uses a dedicated, repository-scoped SSH deploy
key only for `refs/tags/v*` pushes:

- Actions secret: `RELEASE_TAG_SSH_KEY`
- Write deploy key: `pharosville-release-workflow`

The workflow still uses its short-lived `GITHUB_TOKEN` for GitHub Release API
calls and audits. Never replace the SSH secret with a personal access token or
commit either half of the key pair. `npm run check:release-credentials` verifies
that both configured names exist and that the deploy key retains write access.

To rotate the credential, create a new repository-specific Ed25519 key pair,
replace the Actions secret and deploy key together, delete all local key files,
then run `npm run check:release-credentials` and dispatch the workflow's `audit`
operation. Rotation does not move or recreate existing semantic tags.
