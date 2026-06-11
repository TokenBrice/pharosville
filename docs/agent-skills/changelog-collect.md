# Changelog Collect Workflow

Use commit history as evidence, then write a concise product changelog.

## Workflow

1. Inspect state before editing:

   ```bash
   git status --short
   git tag --sort=-creatordate | sed -n '1,40p'
   rg -n "changelog|release notes|version|beta|v[0-9]" README.md docs src package.json
   ```

2. Pick the commit range:
   - Use the user's explicit range when provided.
   - Else use the last changelog entry's recorded range/hash through `HEAD`.
   - Else use the latest tag through `HEAD`.
   - Else use recent meaningful history and say there is no prior release anchor.

3. Gather evidence:

   ```bash
   git log --date=short --pretty=format:'%h%x09%ad%x09%s' <range>
   git show --stat --find-renames --format=fuller <hash>
   ```

   Read individual diffs only when a commit message is ambiguous or risky.

4. Filter and group:
   - Lead with user-visible product changes.
   - Include reliability, performance, accessibility, and operational changes when they affect users or release confidence.
   - Collapse visual-baseline, generated asset, lint-only, and plan/doc-only commits unless they explain a user-facing change.
   - Group by theme or shipped slice, not one bullet per commit.

5. Write each entry with:
   - Version number, for example `v0.1.3`.
   - Date or release label.
   - One short title.
   - One sentence summary.
   - Three to six bullets.
   - Source commit range or representative hashes.

6. Preserve uncertainty:
   - Do not invent versions or dates.
   - If no tag/changelog anchor exists, state the selected range in the entry.
   - If a commit only updates tests or snapshots, call it validation only.

7. Validate:
   - Review `git diff --check`.
   - Run the smallest tests for the touched files.
   - For TypeScript/JSON changelog data, run typecheck or the focused importing test.

## Output Style

Prefer plain release-note prose:

```markdown
## v0.1.3 - 2026-05-17 - Harbor motion and atmosphere

Collected from commits `4940b86` through `800e184`.

- Added deterministic sea-state signals that drive water and motion ambience.
- Refined ship heading, docking choreography, and footer fleet counts.
- Added keyboard target cycling and time controls for inspection.
```

Avoid internal-only phrasing such as "refactored component X" unless it changes behavior users can observe.
