# Documentation Audit

## Summary

PharosVille's documentation is comprehensive, current (all files updated within 1-5 days of 2026-05-04), and well-structured for agent onboarding. The `docs/pharosville/` pack covers 17 files with clear governance (CURRENT.md as source of truth, AGENT_ONBOARDING.md as fast path). Automated validation (`check-doc-paths-and-scripts.mjs`, `npm run validate:docs`) enforces consistency. However, five gaps exist: missing public-API documentation for critical systems, no architecture diagram, no CONTRIBUTING/SECURITY/LICENSE at repo root, stale planning artifacts piling up in `agents/`, and incomplete guidance on undocumented subsystems like squads and seawall mechanics.

## Findings

### F1: No Public-API JSDoc/TSDoc on Critical Exports

- **Where:** `src/systems/world-layout.ts` (consts, exports), `src/systems/maker-squad.ts` (squad types/fns), `src/systems/seawall.ts` (SeawallPlacement), `src/systems/unique-ships.ts` (ship defs), `src/renderer/world-canvas.ts` (RenderFrameCache, interfaces)
- **Impact:** Agents adding motion, docking, or visual features must reverse-engineer `LIGHTHOUSE_TILE`, `CIVIC_CORE_CENTER`, squad membership logic, seawall barrier model, and unique ship scale/asset links by reading code. New maintainers miss the "why" of exported constants (e.g., ISLAND_PERIPHERY_TILE_DISTANCE = 4 halo is Chebyshev distance, not explained inline).
- **Effort:** mid
- **Reward:** mid
- **Fix sketch:** Add 1-2 sentence JSDoc comments on exported consts/types/functions in world-layout.ts, maker-squad.ts, seawall.ts, and unique-ships.ts. Pair with light summary block in CURRENT.md for each subsystem (1-2 paragraphs linking JSDoc and explaining risk/behavioral contracts).

### F2: Squad System, Seawall Model, Unique Ships Only Documented in CURRENT.md

- **Where:** `docs/pharosville/CURRENT.md` (paragraphs on "Five Maker-family stables", seawall perimeter model, unique ships tier); no call-site or README pointers
- **Impact:** Agents iterating on squad visuals, formation rendering, docking priority, or new heritage ships must search CURRENT.md, then hunt code. The seawall collision model and blocked-water ring logic are only described in prose; agents changing motion or dock placement have no roadmap to the data source or behavioral contract.
- **Effort:** mid
- **Reward:** high
- **Fix sketch:** Add `src/systems/maker-squad.ts`, `src/systems/seawall.ts`, and `src/systems/unique-ships.ts` header comments (3-5 lines each) summarizing data model, cross-file contracts, and risk areas. Link these to CURRENT.md subsections so agents discover both code and narrative context. Alternatively, create `SQUAD_SYSTEM.md` and `SEAWALL_MODEL.md` in `docs/pharosville/` and cite them from CHANGE_CHECKLIST.md pre-edit lane.

### F3: Asset Cache Versioning Protocol Described Only in CURRENT.md, Not at Manifest or Renderer Level

- **Where:** `docs/pharosville/CURRENT.md` lines 28-33 (asset cache version 2026-05-03-pigeonnier-v1 + manifestCacheVersion key); `src/renderer/world-canvas.ts` line ~31 (skyState); `public/pharosville/assets/manifest.json` (no comments)
- **Impact:** Agents bumping assets or cache strategy must read CURRENT.md first. The manifestCacheVersion inclusion in the static-layer cache key is non-obvious; agents may bump style.cacheVersion in manifest but forget the code-side implication, causing cache invalidation to fail or over-invalidate.
- **Effort:** low
- **Reward:** mid
- **Fix sketch:** Add a JSDoc/TypeScript comment on the static-layer-cache key construction in world-canvas.ts (2-3 lines) explaining manifestCacheVersion role. Cross-link to ASSET_PIPELINE.md s/cacheVersion.

### F4: AGENTS.md Links to docs/pharosville/AGENT_ONBOARDING.md, But No Reverse Reference

- **Where:** `AGENTS.md` (line 27-29 reads "Read docs/pharosville/AGENT_ONBOARDING.md"); `docs/pharosville/AGENT_ONBOARDING.md` (no back-link to AGENTS.md)
- **Impact:** Low friction, but one-way link means agents finishing AGENT_ONBOARDING.md don't know AGENTS.md exists. Validator `check-doc-paths-and-scripts.mjs` enforces AGENTS.md → AGENT_ONBOARDING.md but does not check the reverse.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Add a single sentence to AGENT_ONBOARDING.md (after "Fast Start") pointing back to AGENTS.md as the canonical repo guide and mentioning that AGENTS.md includes scope, change rules, and validation lanes.

### F5: No Architecture Diagram for Canvas Renderer + Pages Function + Pharos API Chain

- **Where:** N/A (missing)
- **Impact:** New agents must stitch together README.md (Pages Function proxy), AGENTS.md (three-tier design: browser → Pages Function → Pharos API), CURRENT.md (world model + renderer), and `src/` by reading code. No single visual showing the client-side app boundary, the Pages Function role, the API allowlist, and the data flow from Pharos API to world state.
- **Effort:** high
- **Reward:** high
- **Fix sketch:** Create a 2-3 panel SVG or Mermaid diagram in `docs/pharosville/ARCHITECTURE.md`: (1) request flow from browser `/api/*` proxy to Pages Function to Pharos API, (2) world model instantiation from API response to renderer, (3) asset manifest loading and sprite decode pipeline. Link from README.md and AGENT_ONBOARDING.md step 4. Include cache invalidation and asset versioning in the data-flow panel.

### F6: Agent Planning Artifacts Piling Up in `agents/` Without Lifecycle Guidance

- **Where:** `agents/` contains 10+ active plan files (2026-05-01 to 2026-05-03) + 8+ in `agents/completed/`; no documentation on when/how to archive
- **Impact:** Agents do not know whether plans in `agents/` are stale, blocked, or current work. The README at `docs/pharosville/README.md` says "Historical plans were intentionally not migrated here", but does not describe the archive/delete/keep lifecycle. Agents may duplicate work or assume a plan is live when it was actually superseded.
- **Effort:** low
- **Reward:** mid
- **Fix sketch:** Add one short section to `docs/pharosville/README.md` (after "Start Here") titled "Plan Artifact Lifecycle": plans in `agents/` are active; completed or superseded plans move to `agents/completed/` with a brief note (1 line) explaining why. Plans over 10 days old with no completion notes are considered stale and may be archived. Link from AGENT_ONBOARDING.md step 5 (handoff notes).

### F7: No Public-Facing CONTRIBUTING.md or SECURITY.md at Repo Root

- **Where:** N/A (missing)
- **Impact:** No external onboarding path for contributors outside the agent team. No security policy (e.g., reporting vulnerabilities, checking the Pages Function secret handling, API key exposure risk). If the repo were open-source or shared with a broader team, the absence would be friction.
- **Effort:** high
- **Reward:** low (only if repo visibility/collaboration expands)
- **Fix sketch:** Create `CONTRIBUTING.md` (brief: link to AGENTS.md, CLAUDE.md, and PR review process) and `SECURITY.md` (API key handling, Pages Function secret practices, no client-side secrets, same-origin API proxy). These can be lightweight; most rigor is in AGENTS.md already.

### F8: Validation Script Enforces Path/Script Refs but Not Semantic Staleness

- **Where:** `scripts/check-doc-paths-and-scripts.mjs` checks link targets and `npm run` command existence; does not flag docs claiming "Last updated: DATE" older than N days or code-side semantics (e.g., const name changes without doc updates)
- **Impact:** KNOWN_PITFALLS.md claims last update 2026-04-29 (5 days old at audit time); CURRENT.md is 2026-05-03 (fresh). No lint rule catches drift like "Do not reference route.lighthouse (renamed to route.lighthouse-headland)" or "SeawallPlacement.yOffset was moved to overlayVerticalShift". Agents relying on docs for copy-paste patterns may read stale guidance.
- **Effort:** mid
- **Reward:** low (lower frequency issue; lint complexity tradeoff)
- **Fix sketch:** Optional: extend `check-doc-paths-and-scripts.mjs` to warn if "Last updated:" date in onboarding-scope files is older than 7 days. Adds ~20 lines; lower priority than F1-F6.

### F9: README.md at Repo Root Unclear on First 30 Seconds For Fresh Contributor

- **Where:** `README.md` lines 1-5 assume reader knows "Pharos", "PharosVille", and "Cloudflare Pages Functions"; no "What is this?" para before agent/command info
- **Impact:** A fresh agent cloning the repo sees "Standalone PharosVille frontend for pharosville.pharos.watch" without context on whether this is a prototype, a product, a data pipeline, or a UI library. Agent onboarding docs exist, but a 2-sentence "Why" section in README.md would lower the activation energy.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Add a 2-3 sentence "What is PharosVille?" section after the title in README.md, then link to AGENTS.md and docs/pharosville-page.md. Example: "PharosVille is a Canvas 2D maritime analytics UI for Pharos stablecoin signals. It runs as a desktop-only web app served at pharosville.pharos.watch and uses local pixel-art sprites and a pure world model to render real-time stablecoin supply, dock chain presence, and risk indicators."

### F10: `CLAUDE.md` Is a Pointer, But Suggests Single-Use Design

- **Where:** `CLAUDE.md` (4 sentences pointing to AGENTS.md + 4 sentences on scratch paths); no indication whether it should grow or remain minimal
- **Impact:** Agents may assume CLAUDE.md is "placeholder" and not update it if multi-agent memory needs evolve. If multiple agents collaborate, CLAUDE.md is often a shared memory file; the current minimalist design is fine, but undocumented intent may lead to accidental bloat or deletion.
- **Effort:** low
- **Reward:** low
- **Fix sketch:** Add one line comment at end of CLAUDE.md: "This file is intentionally minimal; canonical agent guidance lives in AGENTS.md. Use CLAUDE.md only as a pointer and for repo-scoped scratch-path conventions."

## Priority Summary

1. **F2 (Squad/Seawall/Unique Ships subsystem docs) — mid effort / high reward** → Critical for asset/motion work; unblocks agent iteration on these three systems.
2. **F5 (Architecture diagram) — high effort / high reward** → Onboarding leverage; saves agents 20-30 minutes of code reading per session.
3. **F1 (JSDoc on public APIs) — mid effort / mid reward** → Quality of life; reduces reverse-engineering for motion, visual, and docking changes.
4. **F3 (Asset cache versioning protocol) — low effort / mid reward** → Prevents cache-invalidation bugs; quick win.
5. **F6 (Plan lifecycle) — low effort / mid reward** → Eliminates plan-duplication friction; brief addition to README.
6. **F9 (README "What is this?") — low effort / low reward** → Onboarding hygiene; soft benefit but easy.
7. **F4, F7, F8, F10** → Nice-to-have; lower impact or scope-dependent.

