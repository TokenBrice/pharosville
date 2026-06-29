# GitHub Visibility Plan

Created: 2026-06-29

Goal: make `TokenBrice/pharosville` easier to discover, trust, inspect, and share on GitHub without weakening the standalone PharosVille deployment or exposing server-side secrets.

## Current Baseline

Evidence collected on 2026-06-29:

- Repository: `https://github.com/TokenBrice/pharosville`
- Visibility: public
- GitHub description: `Standalone PharosVille map app`
- GitHub homepage: empty
- GitHub topics: none
- GitHub license detection: none, even though `package.json` says `MIT`
- GitHub community profile health: 28%
- Community files detected by GitHub: README only
- Missing community files: `LICENSE`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, issue templates, PR template
- Releases: none published
- Tags: `v0.2.2` exists; additional `wow-revamp-checkpoint-*` tags exist locally
- Issues: enabled, zero issues
- PRs: zero
- Discussions: disabled
- Wiki/projects: enabled, but not visibly used
- Branch protection/rulesets: missing; `npm run check:branch-protection` reports no classic branch protection and no rulesets
- Workflows: deploy and canary smoke exist and have recent successful canary runs
- Recent GitHub traffic: zero repository views in the last 14 days; 538 clones / 61 unique cloners, likely automation-heavy
- README: technically useful for maintainers, but not yet a strong public product page
- Social assets: `public/og-card.png` exists and is referenced by `index.html`, but README does not surface it
- Changelog: strong in-app typed changelog exists in `src/content/pharosville-changelog.ts`; no crawlable `CHANGELOG.md` or GitHub Releases

Comparison source: `/home/ahirice/Documents/git/pharos-watch` was inspected read-only for inspiration. The strongest reusable patterns are its public README structure, badges, community files, issue forms, PR template, security posture, changelog/release surfacing, OG-image documentation, and `llms.txt`.

## Strategy

Treat GitHub as a public product surface, not just a source mirror. The repo should answer five questions quickly:

1. What is PharosVille?
2. Can I try it immediately?
3. Why should I trust it?
4. How is it built and operated?
5. How can I report, contribute, or follow changes?

The highest-leverage work is not more code. It is metadata, a better README, community files, releases, visual proof, and GitHub-native trust signals.

## Execution Status

Last updated: 2026-06-29

Implemented on `main`:

- `564b96f Improve GitHub visibility foundation`
  - Reworked `README.md` into a public product page with badges, preview media, trust boundaries, repo map, validation, and contributor links.
  - Added `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SUPPORT.md`, issue forms, and a PR template.
  - Added `CHANGELOG.md`, `ROADMAP.md`, `docs/README.md`, `docs/pharosville/GITHUB_MEDIA.md`, `public/llms.txt`, and `public/manifest.webmanifest`.
  - Added GitHub media under `docs/pharosville/media/`.
  - Added package metadata for repository, homepage, and issue tracker.
  - Added CodeQL, Dependabot, and a reusable GitHub Actions setup action.
- `724bb97 Fix tracked visibility doc references`
  - Fixed tracked Markdown link labels so CI documentation guards pass.
- `0e9c63d Tune Dependabot visibility cadence`
  - Tuned Dependabot to minor/patch-only automation with cooldowns and auto-rebase.
  - Closed the noisy first-run Dependabot PRs and documented rollout follow-up in issue #6.

GitHub admin work completed:

- Repository description: `Canvas maritime observatory for live Pharos stablecoin market signals.`
- Repository homepage: `https://pharosville.pharos.watch/`
- Topics: `canvas`, `cloudflare-pages`, `data-visualization`, `defi`, `open-source`, `pharos`, `react`, `stablecoins`, `typescript`, `vite`
- Wiki and Projects disabled.
- Labels seeded for visibility, release, media, discoverability, security, ops, accessibility, visual, data, and priority/type tracking.
- Issues #2-#8 seeded for manual/admin follow-up and ongoing upkeep.
- GitHub Release `v0.2.2 - Signal Clarity` published with media assets.
- `main` protected with a repository ruleset and classic branch protection requiring PR review plus strict checks: `typecheck`, `unit`, `guards`, `build`, `visual`, `visual-cross-browser`.

Verified:

- `npm run validate:changed` passed for the final config change.
- `npm run check:branch-protection` passed after protection restoration.
- Main workflows for `0e9c63d` passed: Deploy to Cloudflare Pages and CodeQL.
- Live deploy smoke passed through the Deploy workflow.
- GitHub community profile health is now 100%.
- Open PR queue is clean after closing stale first-run Dependabot PRs.

Remaining manual item:

- Upload `public/og-card.png` as the repository social preview in GitHub Settings. GitHub exposes the state through GraphQL, but the upload itself is a browser settings action rather than a supported API operation. This is tracked in issue #2.

## Priority 0: Repository Metadata

These are admin/UI changes, not code changes.

Actions:

- Set repository homepage to `https://pharosville.pharos.watch/`.
- Replace the GitHub description with a more searchable one, for example:
  - `Canvas maritime observatory for live Pharos stablecoin market signals.`
- Add focused topics:
  - `pharos`
  - `stablecoins`
  - `defi`
  - `data-visualization`
  - `canvas`
  - `react`
  - `typescript`
  - `cloudflare-pages`
  - `vite`
  - `open-source`
- Consider disabling unused GitHub Wiki and Projects until they are intentionally populated.
- Consider enabling Discussions only after README/community files are ready and there is a clear category set.
- Upload `public/og-card.png` as the repository social preview in GitHub settings.

Acceptance criteria:

- GitHub repository header shows a clear description, live homepage link, and relevant topics.
- Repository social cards use the PharosVille visual identity.
- Unused GitHub surfaces do not distract visitors.

## Priority 1: Public README Refresh

The current README is useful for agents and maintainers, but the first screen should work for strangers arriving from search, social links, or another repo.

Recommended README structure:

1. Title and badges:
   - live app
   - deploy workflow
   - canary smoke workflow
   - license
   - TypeScript / React / Cloudflare Pages, if useful
2. One-sentence positioning:
   - `PharosVille turns live Pharos stablecoin signals into a desktop-only maritime observatory built with React, Canvas 2D, and Cloudflare Pages.`
3. Preview image:
   - embed `public/og-card.png`
   - optionally add one committed visual snapshot for the actual app shell
4. Try it:
   - `https://pharosville.pharos.watch/`
   - note that the canvas world is intentionally desktop-only
5. What it shows:
   - stablecoin supply and presence
   - chain docks
   - risk/status water zones
   - detail panel and accessibility ledger parity
6. What it does not do:
   - no wallet connection
   - no trading
   - no custody
   - no user accounts
   - no browser-exposed API key
7. Architecture at a glance:
   - same-origin `/api/*`
   - Cloudflare Pages Function proxy
   - server-side `PHAROS_API_KEY`
   - pure world model and Canvas renderer
8. Repo map:
   - `src/`
   - `shared/`
   - `functions/`
   - `public/pharosville/assets/`
   - `docs/pharosville/`
   - `.github/workflows/`
9. Local development quickstart:
   - `npm ci`
   - `npm run onboard:agent`
   - `npm run dev`
   - local API-key guidance, with the existing server-side warning
10. Validation:
   - `npm run validate:changed`
   - `npm run validate:release`
11. Links:
   - architecture
   - testing
   - operations
   - security headers
   - changelog/releases
   - contributing/security once added

Acceptance criteria:

- A visitor can understand and try PharosVille from the first README viewport.
- README includes a real visual preview, not only text.
- README surfaces trust boundaries clearly, especially `PHAROS_API_KEY` staying server-side.
- README badges point to public workflows that currently pass.

## Priority 2: Community Profile Files

GitHub currently recognizes only the README. Add a complete but lightweight community profile.

Files to add:

- `LICENSE`
  - Use the MIT license if that remains the intended license.
  - This fixes GitHub license detection.
- `SECURITY.md`
  - Explain supported version/branch.
  - Direct private vulnerability reports to the project owner path.
  - Explicitly call out that `PHAROS_API_KEY` must never be exposed client-side.
  - Link `docs/pharosville/SECURITY_HEADERS.md`.
- `CONTRIBUTING.md`
  - Keep it practical: setup, branch workflow, validation lanes, no generated `dist/`, no secret exposure, desktop gate preservation.
  - Link `AGENTS.md` and `docs/pharosville/AGENT_ONBOARDING.md` for agent work.
- `CODE_OF_CONDUCT.md`
  - Standard contributor covenant or concise project conduct policy.
- `SUPPORT.md`
  - Clarify support channels and where to report app bugs, docs issues, and security issues.

Acceptance criteria:

- GitHub community profile score materially improves from 28%.
- GitHub license badge and license detection work.
- A contributor can find how to report bugs, security issues, and docs drift without reading internal agent docs.

## Priority 3: GitHub Templates

Add templates so every inbound issue or PR carries useful context.

Recommended issue forms:

- `.github/ISSUE_TEMPLATE/bug_report.yml`
  - affected URL
  - viewport/device/browser
  - expected vs actual
  - console/network symptoms
  - whether desktop gate was active
- `.github/ISSUE_TEMPLATE/visual_regression.yml`
  - screenshot/video
  - time mode, reduced motion, zoom/camera state if relevant
  - affected visual area
  - matching Playwright snapshot if known
- `.github/ISSUE_TEMPLATE/data_or_signal_issue.yml`
  - affected stablecoin/chain
  - observed value
  - expected value/source
  - timestamp
  - Pharos API endpoint if known
- `.github/ISSUE_TEMPLATE/docs_issue.yml`
  - affected document
  - stale or missing claim
  - proposed correction
- `.github/ISSUE_TEMPLATE/feature_request.yml`
  - user problem
  - proposed behavior
  - whether it changes PharosVille visual semantics

Recommended PR template:

- Summary
- Why
- Screenshots/video for UI or canvas changes
- Validation run
- Risk notes
- Secret/API-key checklist
- Desktop gate checklist

Acceptance criteria:

- New issues guide reporters into actionable evidence.
- PRs consistently mention validation and visual proof when applicable.
- Templates reinforce repo-specific hard rules without becoming noisy.

## Priority 4: Releases and Changelog

The app already has a strong in-app changelog, but GitHub visitors cannot see release history without running the app.

Actions:

- Create `CHANGELOG.md` generated from `src/content/pharosville-changelog.ts` or maintained alongside it.
- Publish GitHub Release `v0.2.2` using the existing tag.
- Attach or embed:
  - `public/og-card.png`
  - one desktop shell screenshot from committed visual snapshots or a fresh `outputs/` capture promoted into docs
  - a concise release summary copied from the in-app changelog
- Decide whether `wow-revamp-checkpoint-*` tags should remain public. If they are not useful to visitors, prefer release notes that make `v0.2.2` the obvious canonical release.
- Add a lightweight release checklist in docs:
  - update in-app changelog
  - update `CHANGELOG.md`
  - tag release
  - publish GitHub Release
  - run `npm run validate:release`
  - run live smoke after deploy

Acceptance criteria:

- GitHub Releases shows at least one real release.
- README links to changelog and latest release.
- The release page demonstrates visible product progress without requiring source-code inspection.

## Priority 5: Trust and Security Signals

Visibility only helps if the repo looks reliable.

Actions:

- Configure branch protection or repository ruleset for `main`.
  - Required checks:
    - `typecheck`
    - `unit`
    - `guards`
    - `build`
    - `visual`
    - `visual-cross-browser`
  - Require PRs and at least one approval if the collaboration model supports it.
  - Require branches up to date before merge.
- Add a CodeQL workflow for JavaScript/TypeScript.
- Add Dependabot config for npm and GitHub Actions.
- Consider a secret scan workflow or GitHub secret scanning posture check, even though `npm run check:committed-secrets` already exists.
- Add a scheduled dependency/security maintenance cadence if Dependabot noise becomes high.
- Consider adding Scorecard or zizmor later, after the basic community profile is fixed.

Acceptance criteria:

- `npm run check:branch-protection` passes.
- README can honestly badge security/CI posture without overstating it.
- GitHub visitors see active dependency and code scanning hygiene.

## Priority 6: Visual and Shareable Assets

PharosVille is a visual product. GitHub should show that immediately.

Actions:

- Add `docs/pharosville/GITHUB_MEDIA.md` documenting:
  - current OG card
  - repository social preview
  - recommended README screenshot
  - screenshot regeneration command
  - image provenance rules
- Promote a small number of public-facing screenshots into `docs/pharosville/media/`.
  - Use `outputs/` for scratch captures first.
  - Do not commit noisy test artifacts.
- Add one README screenshot of the actual desktop shell, separate from the branded OG card.
- Consider an animated GIF/WebP only if it is small and does not bloat the repo.

Acceptance criteria:

- README has both brand preview and product proof.
- Social sharing uses a polished 1200x630 image.
- Media regeneration is documented and repeatable.

## Priority 7: Discoverability for Search, Agents, and External Readers

Actions:

- Add `public/llms.txt` that summarizes:
  - app URL
  - repo URL
  - what PharosVille does
  - key docs
  - API-key boundary
  - contribution/security links
- Add or improve a public docs index:
  - current `docs/pharosville/README.md` is maintenance-oriented
  - add a shorter public-facing `docs/README.md` or reshape the top of `docs/pharosville/README.md`
- Add `repository`, `homepage`, and `bugs` fields to `package.json` for external tooling:
  - `repository.url`: `git+https://github.com/TokenBrice/pharosville.git`
  - `homepage`: `https://pharosville.pharos.watch/`
  - `bugs.url`: `https://github.com/TokenBrice/pharosville/issues`
- Consider a web app manifest if PharosVille should look more complete in audits, even if installability is not the primary goal.
- Make sure README and docs use natural search terms:
  - stablecoin data visualization
  - DeFi stablecoin dashboard
  - Canvas 2D analytics
  - Cloudflare Pages app
  - Pharos stablecoin signals

Acceptance criteria:

- External tools can identify repo, homepage, issue tracker, and docs.
- Search snippets and AI summaries have enough accurate public context.

## Priority 8: GitHub Workflow Presentation

The workflow coverage is stronger than it looks from the repo landing page.

Actions:

- Add README badges for:
  - Deploy to Cloudflare Pages
  - Canary smoke
  - license after `LICENSE` exists
- Consider splitting CI naming if badge text is too deployment-heavy:
  - `CI / Deploy`
  - `Live Canary`
- Add `.github/actions/setup-workspace/action.yml` to remove repeated checkout/setup/cache/install blocks across jobs, borrowing the pattern from `pharos-watch`.
- Add workflow comments or names that align with badge labels.
- Keep badges honest: do not add CodeQL/security badges until workflows exist and pass.

Acceptance criteria:

- README badges give visitors immediate confidence.
- Workflow files are easier to maintain.
- No badge points to a missing, flaky, or misleading check.

## Priority 9: Public Roadmap and Issue Seeding

An empty issue tracker can look inactive. Seed it intentionally after templates exist.

Actions:

- Add a short `ROADMAP.md` or GitHub Project only if someone will maintain it.
- Seed 5-10 labeled issues from real backlog items:
  - README/media polish
  - GitHub release automation
  - external monitoring beyond GitHub canary
  - screenshot/media refresh automation
  - docs index/llms.txt
  - branch ruleset setup
- Add labels:
  - `bug`
  - `docs`
  - `visual`
  - `data`
  - `security`
  - `good first issue`
  - `help wanted`
  - `ops`
  - `accessibility`
- Use `good first issue` sparingly for bounded docs/template/media tasks.

Acceptance criteria:

- Visitors see active, well-scoped work rather than an empty tracker.
- Labels describe the actual PharosVille work model.
- Roadmap is either maintained or absent; no stale promises.

## Suggested Implementation Order

1. Metadata/admin pass:
   - set homepage, description, topics, social preview
   - disable unused wiki/projects if desired
2. Add community profile files:
   - `LICENSE`
   - `SECURITY.md`
   - `CONTRIBUTING.md`
   - `CODE_OF_CONDUCT.md`
   - `SUPPORT.md`
3. Add issue forms and PR template.
4. Refresh README with badges, preview, trust framing, repo map, and links.
5. Add `CHANGELOG.md` and publish GitHub Release `v0.2.2`.
6. Configure branch ruleset and verify with `npm run check:branch-protection`.
7. Add CodeQL and Dependabot.
8. Add docs/media index and `public/llms.txt`.
9. Seed labels and starter issues.

## First Pull Request Scope

Keep the first PR small enough to review:

- `LICENSE`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SUPPORT.md`
- `.github/pull_request_template.md`
- `.github/ISSUE_TEMPLATE/*.yml`
- README refresh
- `package.json` repository/homepage/bugs metadata

Validation:

```bash
npm run validate:docs
```

Expected result:

- GitHub community profile improves immediately.
- README becomes public-facing.
- No runtime behavior changes.

## Second Pull Request Scope

- `CHANGELOG.md`
- README release/changelog links
- GitHub Release `v0.2.2`
- media documentation and promoted README screenshot if needed
- `public/llms.txt`

Validation:

```bash
npm run validate:docs
```

Expected result:

- GitHub visitors can see project history, visuals, and docs without running the app.

## Third Pull Request / Admin Scope

- Configure branch ruleset.
- Add CodeQL.
- Add Dependabot.
- Add optional secret scanning/security workflow.
- Refactor repeated workflow setup into a local reusable action if desired.

Validation:

```bash
npm run check:branch-protection
npm run validate:changed
```

Expected result:

- Trust badges and branch protection claims are backed by actual GitHub settings.

## Risks and Guardrails

- Do not expose `PHAROS_API_KEY` in docs, examples, fixtures, logs, or browser-visible env names.
- Do not imply PharosVille is mobile-ready; preserve the desktop-only gate language.
- Do not over-badge the README. Badges should communicate trust, not visual noise.
- Do not create broad support promises if there is no maintainer capacity.
- Do not publish misleading releases from checkpoint tags.
- Do not commit generated `dist/`, `test-results/`, local env files, or scratch artifacts.

## Success Metrics

Short term:

- GitHub community profile rises materially from 28%.
- Repository has homepage, topics, license detection, templates, and a stronger README.
- At least one GitHub Release exists.
- `npm run check:branch-protection` passes after admin setup.

Medium term:

- Repository views rise above zero in GitHub traffic.
- Referrers and popular paths start showing README/docs/release traffic.
- Issues/PRs arrive with usable context because templates shape reports.
- Stars/watchers/forks are no longer all zero after external sharing.

Long term:

- PharosVille is discoverable as the public visual companion to Pharos stablecoin analytics.
- GitHub readers can evaluate product, architecture, operations, and contribution paths without private context.
