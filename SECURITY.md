# Security Policy

## Reporting A Vulnerability

Do not open a public issue for vulnerabilities, exposed secrets, auth bypasses, data-leak risks, or abuse paths.

Use GitHub private vulnerability reporting from this repository's Security tab when available. Include:

- affected URL, endpoint, or file path
- impact and prerequisites
- reproduction steps or proof-of-concept details
- whether credentials, API keys, tokens, or requester data may be exposed

If private vulnerability reporting is unavailable, contact the maintainer through a private channel before sharing details publicly.

## Scope

In scope:

- `https://pharosville.pharos.watch/`
- same-origin PharosVille `/api/*` routes
- this repository's React app, Canvas runtime, Pages Functions, CI, and deployment configuration

Out of scope:

- upstream provider outages or incorrect third-party data
- social engineering
- denial-of-service testing without prior coordination
- vulnerability reports that require access to another person's account, inbox, or private infrastructure

## Project Guardrails

- `PHAROS_API_KEY` is a Cloudflare Pages secret and must stay server-side.
- Never expose `PHAROS_API_KEY` as `VITE_*`, static JavaScript, HTML, query strings, logs, docs, or fixtures.
- Browser code must call same-origin `/api/*` only.
- `functions/api/[[path]].ts` must proxy only the allowlisted read endpoints.
- Narrow, short, or portrait-gated viewports must not mount the world runtime or fetch world data.

For header policy and verification commands, see [docs/pharosville/SECURITY_HEADERS.md](./docs/pharosville/SECURITY_HEADERS.md).

## Handling

The maintainer will triage credible reports privately, prioritize fixes by severity, and publish public details only after a mitigation is available. Security fixes may ship without a public issue until disclosure is safe.

Supported version: the live production deployment from `main`.
