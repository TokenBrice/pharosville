# Visual Snapshot Regeneration

Last updated: 2026-05-04

How to regenerate Playwright visual snapshots so they match the GitHub
Actions CI environment. Local snapshots taken on a developer machine
often diverge from CI by sub-percent pixel ratios on landmark sprites
even when the rendered output looks identical to the eye; the image
below is the production-tested workflow.

## Why this matters

CI runs visual tests inside `mcr.microsoft.com/playwright:v1.59.1-noble`
on `ubuntu-latest`. Local Linux distros (Arch, Debian, etc.) ship
slightly different font hinting, GPU rasterisers, and timing
characteristics. Snapshots produced on a host machine commonly fail in
CI even when re-running tests locally passes cleanly.

The Optimizantus run (2026-05-04) hit this on
`pharosville-dusk.png` — local + the same Docker image locally produced
identical pixels, but the GitHub Actions runner produced ~1% different
pixels on the lighthouse-hill + cemetery-islet sprites. We worked
around it by relaxing `maxDiffPixelRatio` for that single test; ideally
snapshots come from the CI image directly.

## Workflow

```bash
docker run --rm -v "$(pwd):/work" -w /work \
  mcr.microsoft.com/playwright:v1.59.1-noble \
  bash -c '
    git config --global --add safe.directory /work \
    && npm ci --prefer-offline --no-audit --no-fund \
    && npx playwright test tests/visual/pharosville.spec.ts \
        --config=playwright.dist.config.ts \
        --update-snapshots \
        --grep "<your test pattern>"
  '
```

Substitute `<your test pattern>` with a `--grep` filter that targets
only the tests whose snapshots you want to regenerate. Examples:

- `desktop canvas shell` — toolbar / shell-level changes
- `night atmosphere` — dawn / dusk / deep-night
- `dense visual` — the dense-fixture canonical scene
- `accessibility` — a11y-grep lane (Chromium only here; the
  cross-browser variant uses `test:visual:dist:accessibility:firefox`)

After the run, `git status` should show modified PNGs under
`tests/visual/pharosville.spec.ts-snapshots-built-dist/`. Eyeball each
diff (open the new vs. old in any image viewer) to confirm the change
matches the intent of your code change before committing.

## Cleanup

The Docker container runs as root; the resulting `test-results/`
directory it creates is root-owned and your user can't `rm` it
afterward. Clean with:

```bash
docker run --rm -v "$(pwd):/work" -w /work \
  mcr.microsoft.com/playwright:v1.59.1-noble \
  bash -c "rm -rf test-results"
```

## When this still doesn't help

If the CI run still rejects your regenerated snapshot (as happened on
the Optimizantus dusk drift), the divergence is between local Docker
and the GitHub Actions runner — likely virtualised CPU rasteriser or
hardware-acceleration flag differences. Two options:

1. Loosen `maxDiffPixelRatio` for the affected test, with an inline
   comment explaining why. The pinch-to-keep tightness on sibling
   tests; only loosen the offender.
2. Open a follow-up to investigate root cause (see
   `agents/health-checkup-followup-2026-05-04/00-followup-implementation-plan.md`
   task #47).

## See also

- `docs/pharosville/TESTING.md` — broader test lane guidance.
- `docs/pharosville/SWARM_OPERATIONS.md` — how to safely orchestrate
  parallel agent work that touches visual code.
