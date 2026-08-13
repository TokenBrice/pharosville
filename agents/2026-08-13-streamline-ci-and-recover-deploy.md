# Streamline CI and recover production deployment

## Outcomes

- Replace the five duplicated Node validation jobs with one deterministic `validate` job.
- Run the Chromium and Firefox DOM/accessibility contracts in one GPU-less visual job.
- Use Cloudflare's pinned Wrangler action and its deployment URL output instead of retry and lookup shell loops.
- Allow the immutable Pages URL a bounded 30-second propagation window before verification fails.
- Keep all seven API routes in the application contract, but classify the non-essential report-card enrichment as a warning-tier live-smoke dependency while its upstream route is unavailable.
- Update branch-protection contracts from seven redundant check names to `validate` and `visual`.
- Publish through a protected pull request, merge after the new checks pass, and watch the exact `main` deployment through live smoke.

## Validation

1. Focused guard and smoke tests while editing.
2. `npm run validate:changed`.
3. `npm run validate:release` before publication.
4. PR checks: `validate`, `visual`, and CodeQL.
5. Main deployment workflow and canonical live smoke.
