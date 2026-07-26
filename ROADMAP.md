# Roadmap

This roadmap is intentionally short. It lists public GitHub-facing work that is useful for contributors and operators without promising dates.

## Active Priorities

- Keep the README, changelog, release notes, and GitHub metadata aligned with the live app.
- Maintain the desktop-only PharosVille gate and prevent unsupported viewports from mounting world data.
- Improve visual proof for GitHub readers with small, current screenshots and social previews.
- Keep branch protection, dependency updates, CodeQL, and live smoke checks healthy.
- Stand up external uptime monitoring outside GitHub Actions. The runbook with exact monitor settings is ready in `docs/pharosville/OPERATIONS.md`; it awaits operator setup in a third-party dashboard.

## Good First Issue Candidates

- Refresh public screenshots after an intentional visual release.
- Improve docs cross-links when a contributor has trouble finding a task-specific guide.
- Add clearer issue examples for visual regressions or data/signal reports.
- Tighten README wording when product scope changes.

## Not Currently Planned

- Mobile or touch-first PharosVille runtime support.
- Wallet connection, trading, custody, or user accounts.
- Client-side API keys or direct browser calls to upstream Pharos APIs.
- Runtime loading of generated remote sprite URLs.
