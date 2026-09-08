# Proxy / edge security review (partial — first run hit the runtime cap)

Recovered finding from the first `security-reviewer` run; a second, narrower run appends below.

## Findings

### PHV-EDGE-001 — Inherited landmark keys reach the HTML rewrite with missing title (DEFECT, low, high confidence)

A public `GET /?sel=constructor` passes `SELECTION_ID_PATTERN` (lowercase identifier), resolves the
inherited `Object` constructor on `LANDMARK_CARD_COPY` via bracket access (`functions/index.ts:128-136`),
and spreads into a card without `title`/`description`. The title rewriter calls
`escapeHtml(undefined)` (`functions/index.ts:90-96`), whose `.replace` throws inside the HTML rewrite
sink (`functions/index.ts:175-179`). Request-local malformed-link failure — not cross-user DoS, not XSS.
CWE-20 / CWE-755.

- Evidence: `LANDMARK_CARD_COPY[rawSelection] ?? null` with no own-property check;
  `element.setInnerContent(escapeHtml(card.title), { html: true })`.
- Fix: `Map.get` or `Object.hasOwn` membership before lookup; keep unknown-selection passthrough;
  add an inherited-name regression in `functions/index.test.ts`. Cost S, 0 render budget.
