# UI / HUD inventory

## Verdict

The world is not a dense dashboard, but its persistent bottom strip is unmistakably a dashboard bolted onto a calm picture: version, navigation, freshness, coverage and FPS share one tiny undifferentiated line (`noon.png @ bottom-left`; `night.png @ bottom-left`). Source uses Georgia almost everywhere, although the stills read as generic compact UI type; the single bundled EB Garamond face is only named `PV Plaque` and is not the governing shell family (`src/pharosville.css:1-8,407-423`). Timber/brass/parchment chrome is coherent with “old harbor,” but not with a quiet Japanese garden; cramped 4×9px footer padding and persistent black backing keep the interface visibly separate from the world (`src/pharosville.css:1175-1194`). Named motion tokens are a strong foundation, but one-off 180ms and 9s transitions break that system (`src/pharosville.css:21-30,570-581,149-180`). Copy oscillates between operational telemetry (“60 fps”), financial status, and storybook harbormaster voice rather than one calm editorial register.

## Findings and complete surface inventory

| Surface | Verdict | Evidence / reason |
|---|---|---|
| `PharosVille v0.16.0` | **Remove from primary** | Release metadata claims first attention in the footer; move to debug/about (`src/pharosville-world.tsx:1232-1238`). |
| **Legend** | **Redesign** | Keep the access point, but a reference-document label does not invite learning (`src/pharosville-world.tsx:1238`). |
| **Find /** | **Keep, redesign** | Essential direct access and good keyboard parity; reveal as a familiar command/search affordance, not footer punctuation (`src/pharosville-world.tsx:1240`). |
| **Harbor ledger** | **Keep, redesign** | This is analytical/a11y parity, but should be secondary to looking, then reading (`src/pharosville-world.tsx:1242`; `src/components/harbor-ledger-panel.tsx:23-30`). |
| **Readings current** | **Keep, rewrite/relocate** | Trust signal belongs in a calm “now” sentence, not jammed against the ledger (`src/pharosville-world.tsx:1242-1247`). |
| **142 of 185 have harbor ties** | **Redesign** | Useful coverage datum, but permanently visible arithmetic reads like KPI chrome (`noon.png @ bottom-left`; `night.png @ bottom-left`). |
| **60 fps** | **Remove from public** | Developer health metric, already conditionally debug-only in source; references captured with debug chrome should not define the public composition (`src/pharosville-world.tsx:1248-1253`). |
| Reset / Observe / Light & motion buttons | **Keep, redesign** | Good native toolbar and labels; three isolated black discs read as utilities. Contrary to the target wording, frames place them bottom-right, matching CSS (`src/components/world-controls.tsx:27-75`; `src/pharosville.css:789-837`; `noon.png @ bottom-right`). |
| Legend overlay | **Redesign radically** | It opens as a 480px dark modal containing zones, six ship classes, landmarks and progressive reference copy—accurate but textbook-dense (`src/components/legend-panel.tsx:104-155,157-227`). **DEFECT:** `noon-legend.png @ entire frame` shows no legend panel despite being the designated open-legend reference; capture/open-state contract is broken or the artifact is mislabeled. |
| Detail panel | **Keep, redesign** | Strong semantic structure and progressive “Read the record,” but the parchment rectangle is visually generic and scroll-panel-like (`src/components/detail-panel.tsx:99-181`; `src/pharosville.css:598-617`). |
| Harbor ledger / accessibility ledger | **Keep, reorganize** | One shared DOM source correctly prevents parity drift; visible mode is an enormous appendix of areas, stations, ships, cemetery and cue legends (`src/components/accessibility-ledger.tsx:113-140,164-183,247-387`). Uppercase tracked headings and dotted rows feel like a report, not a garden almanac (`src/pharosville.css:1081-1163`). |
| Desktop gate branches | **Keep constraint, redesign face** | Client correctly prevents any world chunk below the gate (`src/client.tsx:56-67`), but the CSS face is a timber-framed parchment notice with oversized display type—another theme beside the nocturnal world (`src/pharosville.css:296-400`). |
| Loading / charting veil | **Redesign** | “Charting market winds…” fits the metaphor, but uppercase type, a glowing orb and a hard-coded nine-second veil feel like branded loading choreography, not arrival into stillness (`src/client.tsx:64-67`; `src/pharosville-world.tsx:1089-1100`; `src/pharosville.css:73-180`). |
| Skip link, quick find, hover caption | **Keep** | Native keyboard bypass, direct search and transient target identity are necessary, intent-driven chrome (`src/pharosville-world.tsx:1055-1070,1134-1168`). |
| Harbor chips / observe caption | **Redesign lightly** | They already reveal context near the scene, but 0.64rem labels are too small and the Observe eyebrow repeats UI scaffolding (`src/pharosville.css:1391-1455,1502-1522`). |
| Harbormaster note, since-last-visit, harbor log, changelog | **Consolidate** | Four competing narrative/update surfaces are composed beside details and search; fold orientation/update value into one first-run story and one almanac (`src/pharosville-world.tsx:1102-1123,1169,1205-1209,1256-1260`). |

**DEFECT:** source’s footer freshness has no separator before it, causing “Harbor ledger Readings current” to read as one malformed label (`src/pharosville-world.tsx:1242-1243`; both frames @ bottom-left). **GAP:** controls merely idle at 76% opacity, so chrome never truly disappears (`src/pharosville.css:807-827`). **GAP:** the 14px inset frame remains visible in both reference frames and encloses the scene like a viewport rather than opening a contemplative view (`src/pharosville.css:425-450`; `noon.png @ edges`).

## Ranked ideas

Cost format is **draws / tris / scene textures / likely frame cost; engineering**.

1. **[STEP CHANGE] Scene-first chrome state machine.** Default to the world plus one “now” line and a single quiet menu/search affordance; reveal Find, Guide, Ledger and view controls on pointer approach, keyboard focus, `/`, or recent camera input; retain focusable off-screen semantics. **Why:** lets the garden become the product. **Cost:** 0/0/0/<0.15ms; M. **Risk:** hidden discoverability; counter with first-visit hint and never hide focused controls. **Displaces:** persistent footer, inset frame, always-on black discs. **Depends:** accessibility review and input-mode contract.

2. **[STEP CHANGE] Turn Legend into a three-beat first-run story, not a modal manual.** Beat 1: ship = stablecoin; beat 2: water = peg risk; beat 3: lighthouse = fleet stability, each pointing to a live scene target; then offer “Watch the harbor.” Put full keys behind “Reading guide.” **Why:** teaches through looking and preserves the composition. **Cost:** 0/0/0/<0.2ms; L. **Risk:** interruption/replay state; skippable, once-per-version, deterministic reduced-motion steps. **Displaces:** harbormaster note and first-level legend density. **Depends:** Observe/camera and data-story lanes.

3. **Make the detail panel a woodblock-print record card.** Use an asymmetric ink-and-washi composition: small seal/status, serif title and narrative, restrained rule, sans figures; anchor near selection but flip to a stable side rail when overlap is high. No faux scroll, torn edges or decorative glass. **Why:** selected data feels authored into the world rather than pasted over it. **Cost:** 0/0/0/<0.2ms; M. **Risk:** legibility over busy water; opaque AA surface and stable max measure. **Displaces:** generic parchment gradient and floating-card treatment. **Depends:** scene palette and selection-anchor ownership.

4. **Create a calm “now” caption.** Merge time, fleet condition, freshness and exceptional movement into one low-frequency sentence; coverage moves into Ledger. Update only on meaningful data/time boundaries, not every frame. **Why:** informative ambient viewing without KPI scanning. **Cost:** 0/0/0/negligible; S. **Risk:** prose can conceal severity; warning state must become explicit text + icon. **Displaces:** freshness and tie-count footer items. **Depends:** sea-state/data-story language.

5. **Adopt one serif + one sans system.** Use EB Garamond (already bundled) only for scene titles/narrative; a high-legibility system sans for controls, facts, timestamps and keyboard hints. Set 12/14/16/20/28px roles; retire tiny 0.64rem labels and tracked uppercase. **Why:** separates poetry from instrument reading. **Cost:** 0/0/0/negligible; M. **Risk:** font swap/metric drift. **Displaces:** Georgia everywhere and pseudo-display UI labels. **Depends:** typography asset decision.

6. **Replace “old-school chrome” with quiet palette tokens.** Derive `ink`, `mist`, `moss`, `stone`, `water`, `lantern`, plus semantic risk colors from the final scene palette; keep AA opaque reading surfaces and brass only as the lantern accent. **Why:** DOM belongs to the same light cycle instead of a brown nautical skin. **Cost:** 0/0/0/<0.1ms; M. **Risk:** day/night contrast regressions. **Displaces/re-pins:** timber/brass/parchment tokens and color guards. **Depends:** sky/water/color-grade lanes.

7. **Move version + FPS into an explicit debug overlay.** Toggle with a non-advertised developer shortcut/query flag; include draws/tris/textures/p95 there. Public About/Changelog may retain version. **Why:** removes instrumentation from contemplation while improving diagnostics. **Cost:** 0/0/0/negligible; S. **Risk:** support loses instant version; keep copyable diagnostic block. **Displaces:** footer version/FPS.

8. **Unify motion tokens and intent transitions.** Use `whisper` 180–220ms for controls, `settle` 320–450ms for panels, and no decorative infinite DOM motion; default-visible then fade, with reduced motion instant and zero RAF. **Why:** one calm rhythm. **Cost:** 0/0/0/<0.1ms; S. **Risk:** hiding during focus/camera travel. **Displaces:** hard-coded 180ms/9s and loading beacon breathe. **Depends:** global reduced-motion invariant.

9. **Recast Ledger as a garden almanac.** Non-modal side sheet with sticky semantic index: “Now / Waters / Harbors / Ships / Wrecks / Sources”; searchable ship disclosure and “select in harbor” remain. **Why:** preserves exhaustive parity while making inquiry feel coherent. **Cost:** 0/0/0/<0.3ms; L. **Risk:** virtualizing 185 records can harm screen-reader continuity; keep complete semantic DOM or progressive mounting with explicit controls. **Displaces:** giant report-dialog and duplicate legend keys. **Depends:** accessibility owner.

10. **Make the below-gate page a beautiful still.** A real pre-rendered seasonal harbor crop with a short accessibility-first explanation, minimum dimensions and links to market/source pages; no renderer/data boot. **Why:** the gate becomes an intentional invitation, not a rejection plaque. **Cost:** 0/0/+1 DOM image/none in world; M. **Risk:** stale branding and bandwidth; responsive AVIF/WebP with descriptive alt. **Re-pins:** gate remains hard and requests no world assets. **Depends:** art-direction still.

11. **Let loading be a held establishing still.** Use the same lightweight gate still/canonical sky palette, one sentence, then a 320ms crossfade when ready—no pulsing orb or nine-second arrival. **Why:** perceived continuity and stillness. **Cost:** 0/0/+0 if shared/<0.1ms; S. **Risk:** long loads seem frozen; add restrained text progress after a threshold. **Displaces:** beacon animation and bespoke gradient scene.

### Five-line copy sample

> 12:25 — a quiet noon over the harbor.  
> 142 of 185 ships are tied to chain harbors.  
> All market readings are current.  
> Select a sail to read the water beneath it.  
> Press `/` to find a stablecoin.

### Default / intent wireframe

```text
┌──────────────────────────── living harbor ───────────────────────────┐
│                                                                      │
│     [selection] ┌ woodblock record ┐                                 │
│                 └──────────────────┘                                 │
│                                                                      │
│  12:25 — quiet noon · readings current                 [quiet menu]  │
└──────────────────────────────────────────────────────────────────────┘
  on intent →  [Find /]  [Reading guide]  [Harbor ledger]  [↺][◉][☼]
```

## Rejected

- Full glass HUD: atmospheric blur is decoration, expensive over WebGL, and weakens contrast.
- Persistent ticker of movers: turns observation into trading-terminal urgency.
- Skeuomorphic scrolls/ink-brush icons: cultural costume and invented affordances, not garden restraint.
- Color-only risk legend: violates analytical and accessibility parity.

## Cross-lane notes

Data Story should own the “now” sentence grammar and severity precedence; Sky/Water/Post should publish day/night surface tokens; Observe/Camera should expose deterministic three-beat targets; Accessibility should approve auto-hide focus behavior and ledger structure. The `noon-legend.png` artifact needs recapture or investigation before it can validate any legend redesign.
