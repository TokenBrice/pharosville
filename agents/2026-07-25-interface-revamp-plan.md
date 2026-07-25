# PharosVille Interface Revamp — Implementation Plan

Date: 2026-07-25
Status: **researched, decisions settled, ready to execute**
Scope partner: `agents/2026-07-25-grand-scale-revamp-plan.md` (the world/renderer
revamp running in parallel). This plan touches **only the DOM interface layer**.

---

## 0. Mission

The world is being rebuilt to be stunning and calm. The interface in front of it
is not: a nine-control timber toolbar, a second search bar under it, a large
brass home button, a footer that reads like a status bar, and a detail panel
that dumps sixteen dense fact rows on first click. Every one of those is
furniture between the visitor and the harbor.

**Target: much more minimal, calm, polished, beautiful.** The world is the
subject; the interface is a quiet plaque beside it that fades when unused.

### Operator direction (2026-07-25)

| # | Direction | Source |
| --- | --- | --- |
| 1 | The toolbar strip "can be scrapped, or almost" | screenshot #1 |
| 2 | The circular home button "needs to go" | screenshot #2 |
| 3 | Footer preserves only: PharosVille + version, Legend, Changelog, ship count, **and re-introduces the FPS counter** | screenshot #3 |
| 4 | Detail panels are "super dense and breaking immersion" — simplify toward the poetic atmosphere | screenshots #4, #5 |

### Settled decisions

| # | Decision |
| --- | --- |
| **DU1** | The world toolbar is **deleted**. Three controls survive as a hover-revealed cluster: **Recenter · Observe · Night**. Zoom chip, time slider, clear-override, follow-selected and auto-day-night are removed. |
| **DU2** | The ship search is **deleted entirely** — component, styles, options memo, and its follow-on-select plumbing. |
| **DU3** | The circular home button is **deleted**; recentring lives in the cluster. |
| **DU4** | Footer keeps: `PharosVille v0.3.0 · Legend · Changelog · N ships docked / M total · NN fps`. Drops the disclaimer sentence, "Copy link", and the "Pharos" outbound link. |
| **DU5** | Detail panel becomes **prose first, ledger on demand**: title, water, 2–3 sentences in the harbor's voice, one figure line, and a quiet `Read the record` disclosure holding today's fact rows. |
| **DU6** | Skin direction is **quiet the same skin**: keep parchment/brass/timber, remove the ornament (corner studs, wood grain, inset bevels, triple shadows). One hairline, one soft shadow, more air, larger type. |
| **DU7** | The frame-rate readout comes out from behind `?debug=1` and is always visible in the footer, dimmed. |

### Acceptance criteria

| # | Criterion | Measurement |
| --- | --- | --- |
| **U-A1** | At rest, the only persistent DOM chrome over the world is the footer line and the detail panel when something is selected | screenshot at 1920×1080, nothing else visible above the canvas |
| **U-A2** | Every removed control's function stays reachable by keyboard, and the cheatsheet says how | `src/content/pharosville-controls.ts` + `controls-cheatsheet` render |
| **U-A3** | A ship panel's first screen is ≤ ~55 words of prose + ≤ 3 figures, with no scrollbar at 1080p | manual read + panel height assertion |
| **U-A4** | Every analytical fact visible today is still reachable — in the disclosure or the accessibility ledger | `detail-panel.test.tsx` + `@visual-accessibility` lane |
| **U-A5** | Hover-only controls are fully operable by keyboard and visible on focus | axe/keyboard pass in the accessibility lane |
| **U-A6** | Contrast guard stays green in `warn` mode with no new warnings | `npm run check:pharosville-colors` |
| **U-A7** | No net bundle growth from this workstream | `npm run check:bundle-size` |

---

## 1. Measured baseline (evidence, 2026-07-25)

Read from the working tree at `c604911`.

### 1.1 What is on screen today

| Surface | File | Lines | Notes |
| --- | --- | --- | --- |
| World toolbar | `src/components/world-toolbar.tsx` | 156 | zoom chip, time slider + badge, clear-override, reset, follow, observe, night, auto-cycle — 9 controls, 4 brass corner studs |
| Ship search | `src/components/ship-search.tsx` | 132 | combobox + listbox, 8 matches, own key-propagation rules |
| Home button | `src/pharosville-world.tsx:797-805` | 9 | 56 px brass disc, duplicates the toolbar's reset |
| Fullscreen button | `src/pharosville-world.tsx:788-796` | 9 | same disc, top-right |
| Footer ("beta tag") | `src/pharosville-world.tsx:818-836` | 19 | 6 items + 5 separators + a debug-gated FPS slot |
| Detail panel | `src/components/detail-panel.tsx` | 234 | header + Identity `<dl>` + Position `<dl>` + members + links + close |
| Detail row builder | `src/lib/format-detail.ts` | 226 | folds ~16 raw facts into ≤ 8 display rows |
| Ambient chrome | hover tooltip, observe caption, harbor log, since-last-visit, zone labels | — | five more floating surfaces, three of them inline-styled |
| Reference dialogs | `changelog-panel.tsx`, `legend-panel.tsx` (+ `controls-cheatsheet.tsx`) | 141 / 289 / 87 | lazy-loaded, shared chrome |
| Styles | `src/pharosville.css` | 1,514 | ~700 lines belong to the surfaces above |

### 1.2 Findings

**UF1 — The detail panel's density is manufactured, not inherent.**
`buildDetailFactSections` (`src/lib/format-detail.ts:142-226`) already compresses
~16 raw facts into ≤ 8 rows by *concatenating* them: the Market cap row is
`$2.5B · #12 of 187 · 0.8% of fleet · 8 of 9 price sources agree`, the 24h row is
`-14.0% · 7d -13.1%, 30d -13.2% · depeg history: 16 events on record; worst
+3.3%; last 2026-06-15`. The row cap was held by making each row longer. That is
exactly what screenshot #4 shows. **The fix is hierarchy, not deletion** — the
facts are fine, they just must not all arrive at once.

**UF2 — The accessibility ledger already carries full parity, so the panel is
free to be sparse.** `VISUAL_INVARIANTS.md:24` requires "detail-panel **or**
accessibility-ledger parity" — an inclusive *or*. `accessibility-ledger.tsx:305-351`
emits every ship fact (peg deviation, mast signal, momentum, depeg history,
stress driver, safety grade and all five report-card dimensions) as `sr-only`
prose. Nothing analytical is lost by moving density behind a disclosure, and
even a hard cut would satisfy the contract. This is the single most enabling
finding in this recon.

**UF3 — The panel already scrolls, which is the immersion break.**
`--pv-detail-panel-max-height: min(560px, calc(100% - 86px))` with
`overflow: auto` on `__inner` (`pharosville.css:503,559-565`). A panel that
scrolls on first open is a form, not a plaque. Prose-first removes the scroll in
the common case.

**UF4 — Two of the nine toolbar controls have no reason to exist.** Follow-selected
duplicates what selection already does (clicking a ship frames it, and
`use-canvas-resize-and-camera` follows it), and the zoom chip is a readout with
no action. Auto-day-night is a 60-second `setInterval` toggle
(`use-world-time-controls.ts:41-45`) that fights the deliberate
`?t=`/`?n=` URL state.

**UF5 — Deleting the search costs less than it appears.** `handleSearchSelect`
shares the follow path with URL deep links via `pendingFollowDetailIdRef` +
`followRequest` (`pharosville-world.tsx:244-272`), but the URL path sets the ref
directly and does not need `followRequest` at all. The removable surface is:
`ship-search.tsx`, `shipSearchOptions` (a sort over 187 ships per world change),
`handleSearchSelect`, the `followRequest` state, `.pharosville-ship-search*`
CSS (58 lines), the `find-ship` control entry, and two Playwright interactions.
Keyboard target cycling (Tab/Enter) and the ledger remain the ways to reach any
of the ~205 ships without pointing at them.

**UF6 — Time-of-day survives the slider's removal.** The hour lives in
`?t=` / `?n=` (`use-world-url-state.ts:200-212`) and is applied through
`resolveWallClockHour`. Removing the slider removes an *input*, not a
capability: a shared link with `#t=18.5` still renders dusk, and the Night
control still flips presets.

**UF7 — Contrast is guarded but forgiving.** `scripts/check-pharosville-colors.mjs`
runs in `warn` mode by default, hard-fails only below 3:1, and checks a fixed
list of `--pv-*` token pairs. The "quiet skin" pass must not invent new
low-contrast body text; dimming *controls* (not text) is where the risk sits, so
DU1's idle opacity is specified in §3.2 with a floor.

**UF8 — There are no pixel baselines to re-record.** `tests/visual/*.spec.ts`
capture buffers for stability checks but there is no `*-snapshots/` directory in
the repo. Interface changes therefore break *assertions*, not baselines — a much
cheaper failure mode. Affected: `pharosville.spec.ts:57,59,132,134,145,171,215,
249,275`, `pharosville-performance.spec.ts:460`, `pharosville-gates.spec.ts:246,270`.

**UF9 — Shared-file collision risk with the world revamp is narrow but real.**
The other plan touches `src/pharosville-world.tsx` in exactly one region — the
observatory zone labels at `:704-730` (their W2.9 re-anchors them) — plus
`VISUAL_INVARIANTS.md` (their W7.1 rewrites it) and `RUNTIME_FACTS.md`
(regenerated). Everything else in this plan is disjoint from their file list.

---

## 2. Design specification

### 2.1 Principles

1. **The world is the subject.** Chrome that is not being used should be barely
   there, and never in the way of the lighthouse or the horizon.
2. **One voice.** The harbor speaks in plain maritime English. Numbers are
   evidence quoted inside that voice, not the voice itself.
3. **Progressive depth.** First read = what this is and how it's doing. Second
   read = the record. Third = the ledger and pharos.watch.
4. **One border, one shadow.** Ornament earns its place or leaves.
5. **Nothing hidden that isn't also reachable.** Hover-revealed ≠ hover-only:
   focus reveals it too, keyboard reaches it, and the cheatsheet names it.

### 2.2 Layout at rest

```
┌──────────────────────────────────────────────────────────────┐
│                                                         ⛶    │  fullscreen, 0.35 idle
│                                                              │
│                     [ the world ]                            │
│                                                              │
│                                              ·  ·  ·         │  cluster, 0.4 idle
│                                                              │
│  PharosVille v0.3.0 · Legend · Changelog · 122/187 · 58 fps  │  footer, one line
└──────────────────────────────────────────────────────────────┘
```

With a selection, one panel docks beside the selected entity — as today, via
`--pv-detail-x/y` anchoring — and nothing else appears.

### 2.3 Detail panel — prose first, ledger on demand

```
  SHIP                                    ← eyebrow, 10px, letterspaced
  Tether Gold                             ← 1.5rem, unchanged size
  ▪ Watch Breakwater                      ← swatch + zone label only

  A bullion barge — Tether's gold         ← 2–3 sentences, 15px/1.6
  reserve. Early-warning stress
  signals set her berth.

  $2.5B · 12th of 187 · −14.0% 24h        ← the reading line, ≤ 3 figures

  Read the record ⌄            Stablecoin →
  ─────────────────────────────────────
  (collapsed: today's Identity / Position
   rows, members, and secondary links)
```

**Composition rules**

| Slot | Source | Rule |
| --- | --- | --- |
| Eyebrow | `detail.kind` | unchanged |
| Title | `detail.title` | unchanged |
| Water line | `detail.status` | swatch + `label` only. The `reading` clause ("Early-warning signals worth watching") and the `figure` (`-1 bps vs GOLD`) move into the prose / reading line. |
| Prose | `detail.summary` + `paragraphs` + `culturalSignificance` | ≤ 3 sentences, ≤ ~55 words, one `<p>` per sentence group. Rewritten in §5. |
| Reading line | **new** `buildDetailReadingLine()` | ≤ 3 figures, `·`-joined, from a fixed per-kind priority list. Never wraps to 3 lines. |
| Record | existing `buildDetailFactSections()` | unchanged output, moved inside `<details>`. The ≤ 8-row contract and its tests survive as-is. |
| Members | `detail.members` | inside the record. |
| Links | `detail.links` | the **first** link stays on the first screen as a quiet text link (`Stablecoin →`); the rest go into the record. |
| Close | `onClose` | one affordance: the existing "Close details" text button, restyled quiet. Escape unchanged. |

**Reading-line priority by kind** (first three available wins):

- `ship`: market cap → fleet rank → 24h change → peg deviation → cycle tempo
- `dock`: stablecoin supply → stablecoin count → health band
- `lighthouse`: PSI score → band → 24h trend direction
- `area`: DEWS band → stablecoin count
- `grave`: cause → date → peak market cap
- `pigeonnier`: none (prose + link only)

**The lighthouse panel (screenshot #5)** collapses from four sections to:

```
  LIGHTHOUSE
  Pharos Lighthouse
  PSI is unavailable, so the beacon is unlit.

  Read the record ⌄                     PSI →
```

— i.e. when there is no figure to quote, the reading line is omitted rather than
padded with "None on record".

### 2.4 Quiet skin — token deltas

| Property | Today | Target |
| --- | --- | --- |
| Panel frame | 6 px timber padding + 2 px edge + 4 brass studs + `::before` light bleed | 1 px `rgba(108,74,20,0.45)` hairline, no studs, no bleed |
| Panel background | 3 stacked repeating gradients + radial parchment | one flat parchment + one very low-contrast radial for warmth |
| Panel shadow | 5 shadows (2 inset, 1 bleed, 2 drop) | one: `0 10px 30px rgba(0,0,0,0.45)` |
| Panel padding | `18px 22px` | `26px 28px` |
| Body type | 13 px Georgia | 15 px Georgia, `line-height: 1.6` |
| Section titles | 10 px, `0.18em` tracking, uppercase | unchanged (they now appear only inside the record) |
| Fact rows | dotted bottom borders on every row | no borders; row gap `10px`, label colour carries the split |
| Buttons | `.pv-brass-button` radial brass + 3 shadows + 1.5 px border | flat `--pv-brass-dark` glyph on transparent; hover raises to `--pv-brass-highlight`; no border, no shadow |
| Links | `.pv-panel-link` brass pill | text link, brass, 1 px underline on hover only |
| Footer | `rgba(10,16,22,0.85)` pill, italic, `|` separators | no background, `·` separators, `0.72rem`, `rgba(232,220,196,0.55)` |
| Corner studs `.pv-corner-brass` | 22 px brass discs on every panel | deleted (class and all 6 usages) |
| Panel entrance | `pv-panel-enter` 240 ms rise | keep — it is the one motion that reads as breath. Reduced-motion path unchanged. |

Retained: the parchment/brass/timber palette, `PV Plaque` / Georgia typography,
the panel-enter animation, and every `--pv-*` token name (so the contrast guard's
pair table keeps resolving).

### 2.5 Hover-revealed cluster

- Position: bottom-right, above the footer line, vertically stacked or in a row
  of three — final placement decided against the live composition, but it must
  not sit over the lighthouse (`VISUAL_INVARIANTS.md:44`).
- Idle: `opacity: 0.4`, glyph only, no frame, no background.
- Active: `opacity: 1` on `:hover`, `:focus-within`, and for 2 s after any
  camera input (so a visitor who just panned sees where the controls are).
- Coarse/no-hover pointers: `@media (hover: none) { opacity: 1 }`.
- Reduced motion: opacity change is instant, no transition.
- Each control keeps its current `aria-label` and `title` verbatim
  (`Reset view`, `Observe harbor`/`Stop observing`, `Switch to day`/`Switch to
  night`) so existing Playwright selectors keep resolving.
- The fullscreen button joins the same idle/active rule but stays top-right.

**Accessibility floor:** the 0.4 idle glyph is a UI component under WCAG 1.4.11
(3:1 non-text contrast). Brass `#8a6531` at 0.4 over the night sea does not
clear it, so the idle state also carries a `2px` dark scrim disc
(`rgba(6,12,18,0.45)`) behind the glyph, and the glyph idles at
`--pv-brass` rather than `--pv-brass-dark`. Verify with the contrast script's
decorative pair rule before merging; if it still falls short, raise idle to 0.55
rather than weakening the guard.

---

## 3. Workstreams

Eight streams. **U1 first** (it deletes the most code and unblocks the layout
decisions); U2–U6 can then run in any order; U7–U8 close.

### U1 — Remove the chrome

| # | Task | Files | Verify |
| --- | --- | --- | --- |
| U1.1 | Delete `WorldToolbar` and its test; remove `.pharosville-world-toolbar`, `.pv-chip-zoom`, `.pv-time-control*`, and the `.pharosville-hud` wrapper if nothing else lands in it | `components/world-toolbar.tsx(.test.tsx)`, `pharosville.css:486-499,700-717,861-926` | `npm test` green after test deletion |
| U1.2 | Delete `ShipSearch` (DU2): component, `.pharosville-ship-search*` CSS, `shipSearchOptions` memo, `handleSearchSelect`, and the now-orphaned `followRequest` state | `components/ship-search.tsx`, `pharosville-world.tsx:246-258,775`, `pharosville.css:1455-1514` | URL deep-link follow still works (`#sel=ship.usdt&` cold load frames the ship) |
| U1.3 | Delete the home button (DU3) and its CSS half of the shared `.pharosville-fullscreen-button, .pharosville-home-button` rule | `pharosville-world.tsx:797-805`, `pharosville.css:719-757` | no `Recenter map` button in the DOM |
| U1.4 | Remove `follow-selected` from the app: the `canFollowSelected` memo, `handleFollowSelected` wiring from the toolbar, and the control entry. Keep `canvas.handleFollowSelected` — the URL-deep-link path still calls it | `pharosville-world.tsx:555-567,751`, `content/pharosville-controls.ts:120-125` | deep-link follow test still passes |
| U1.5 | Remove auto-day-night: `autoNightCycle` state, its `setInterval`, `toggleAutoNightCycle`, and the control entry | `hooks/use-world-time-controls.ts:25,41-45,91-95`, `content/pharosville-controls.ts:160-165` | no interval remains (`MOTION_POLICY.md` "no analytical timers" gets *more* true) |
| U1.6 | Remove the manual-hour input path: `clearTimeOverride` + the clear-override button. Keep `manualTimeOverrideHour` parsing/apply so `?t=` links still render | `hooks/use-world-time-controls.ts:69-72`, `content/pharosville-controls.ts:143-153` | `#t=18.5` renders dusk; `use-world-url-state.test.tsx` untouched |
| U1.7 | Orphan sweep: `copyWorldUrlState` + `handleCopyViewLink` (footer's Copy link goes in U3), unused `lucide` imports (`Home`, `Timer`, `LocateFixed`, `SunMoon`, `Search`, `Pause`?→kept for Observe), unused CSS tokens | `pharosville-world.tsx`, `hooks/use-world-url-state.ts:66-76` + its test | `npm run lint` clean, no unused exports |

**Exit gate:** the world renders with *nothing* over it except the footer and
(when selected) the detail panel; `npm run typecheck && npm run lint && npm test`
green with deleted tests removed, not skipped.

### U2 — The hover cluster

| # | Task | Verify |
| --- | --- | --- |
| U2.1 | New component `world-controls` under the components directory (does not exist yet): three icon buttons (`RotateCcw` recenter, `Eye`/`Pause` observe, `Moon`/`Sun` night), same `aria-label`/`title` strings as the retired toolbar, same `data-observe-control` attribute on observe (the observe-cancel listener at `pharosville-world.tsx:491-513` keys on it) | unit test mirrors the retired toolbar test's label assertions |
| U2.2 | `.pharosville-world-controls` CSS per §2.5, including `:focus-within`, `hover: none`, and reduced-motion rules | keyboard Tab reveals and reaches all three |
| U2.3 | Post-input reveal: a 2 s `data-recent-input` flag set from the existing camera-intent path, cleared by timeout | pan the map → cluster appears → fades |
| U2.4 | Fullscreen button adopts the same idle/active treatment and loses its brass disc | still toggles; Escape-exits-fullscreen path unchanged |
| U2.5 | Observe stays gated on `threeExperienceReady && !reducedMotion` exactly as today (`pharosville-world.tsx:761-764`) | reduced-motion run shows two controls, not three |

### U3 — The footer

| # | Task | Verify |
| --- | --- | --- |
| U3.1 | Rebuild the footer to: `PharosVille v0.3.0 · Legend · Changelog · N ships docked / M total · NN fps`. Keep `data-testid="pharosville-ship-counter"` and `data-testid="pharosville-fps-counter"` | `pharosville-world.test.tsx:188-198` updated to the new string |
| U3.2 | Remove the `debugChrome` gate on the FPS slot (DU7) and delete `isDebugChromeEnabled` if nothing else uses it — note `?debug=1` still drives `window.__pharosVilleDebug`, which is separate | FPS shows on a plain load; reduced motion still renders `Static` |
| U3.3 | Drop the disclaimer sentence, "Copy link", and the "Pharos" link. **The disclaimer is preserved** — `legend-panel.tsx:138-143` already says "It is an interpretive view, not financial advice"; make sure that sentence stays and reads first in the legend | legend intro asserts the sentence |
| U3.4 | Restyle per §2.4: no pill background, `·` separators, dimmer parchment, `pointer-events` only on the two buttons | contrast guard green |
| U3.5 | Rename the CSS block `.pharosville-beta-tag*` → `.pharosville-footer*` (it stopped being a beta tag) and update the one selector referenced by the outside-pointer-down guard at `pharosville-world.tsx:547` | outside-click-to-clear still ignores footer clicks |

**Note for the operator:** removing "Copy link" means view sharing relies on
copying the address bar (the URL is kept live by `replaceWorldUrlState`), and
removing the "Pharos" link removes the only outbound path to pharos.watch from
the footer — detail-panel links still reach it. Both are per direction #3; say
the word and either can stay.

### U4 — Detail panel restructure

| # | Task | Files | Verify |
| --- | --- | --- | --- |
| U4.1 | Add `buildDetailReadingLine(detail)` returning ≤ 3 figures per §2.3, kind-aware, `null` when nothing qualifies | `lib/format-detail.ts` | new unit tests per kind, including the empty case |
| U4.2 | Split the panel body: header (eyebrow, title, water line, prose, reading line, primary link) and `<details class="pharosville-detail-panel__record">` holding sections/members/remaining links | `components/detail-panel.tsx` | `detail-panel.test.tsx` extended; existing ≤ 8-row tests keep passing against the record |
| U4.3 | Move `status.reading` and `status.figure` out of the water line (into prose / reading line respectively) | `components/detail-panel.tsx:62-72` | screenshot #4's three-clause status line becomes one word pair |
| U4.4 | Disclosure state: closed by default, per-session sticky (a module-level `let`, not storage) so a visitor who opens the record keeps it open while browsing ships | | select two ships in a row → record stays open |
| U4.5 | Remove the scroll in the common case: drop `max-height` to content for the collapsed panel; the record keeps `overflow: auto` with `max-height: min(420px, …)` | `pharosville.css:501-510,559-565` | no scrollbar on a collapsed ship panel at 1080p |
| U4.6 | Members list (`.pv-formation-list`) loses its left brass bar and tinted background; becomes plain rows | | dock panel with 10 harbored coins reads calmly |
| U4.7 | Close control: one quiet text button, bottom-left of the panel, keeps `Close details` accessible name and the mount-focus/restore behaviour | `components/detail-panel.tsx:107-118` | `pharosville.spec.ts:57` and the focus-restore test unchanged |

### U5 — Quiet skin CSS pass

| # | Task | Verify |
| --- | --- | --- |
| U5.1 | Delete `.pv-corner-brass*` and its 6 JSX usages (detail panel ×4, toolbar ×4 — the latter go with U1.1) | no brass studs anywhere |
| U5.2 | Rewrite `.pharosville-detail-panel` + `__inner` per §2.4 (one hairline, one shadow, flat parchment, 26/28 padding, 15 px/1.6 body) | visual read |
| U5.3 | Flatten `.pv-brass-button` and `.pv-panel-link` to glyph/text treatments; keep `:focus-visible` outlines exactly as they are | keyboard focus still obvious |
| U5.4 | Apply the same quieting to the two dialogs (`.pharosville-changelog-panel`, `.pharosville-legend-panel`): drop the `::before` inner rule, reduce to one border + one shadow, raise body line-height | legend and changelog read as the same family |
| U5.5 | Unify the four inline-styled floaters (`harbor-log.tsx`, `since-last-visit.tsx`) into CSS classes sharing one `.pv-notice` treatment, so the family is consistent and themable | no inline style objects left in those two files |
| U5.6 | Hover tooltip and observe caption adopt the same hairline/shadow rule | one visual family across all overlay surfaces |
| U5.7 | Contrast sweep of every changed pair | `npm run check:pharosville-colors` — zero new warnings |

### U6 — Copy and voice

The panel is now mostly words, so the words have to be good.

| # | Task | Files | Verify |
| --- | --- | --- | --- |
| U6.1 | Rewrite `PLACEMENT_NARRATIVES` (8 strings) to full, warm sentences that can stand alone as the panel's opening line | `systems/detail-model.ts:653-663` | reads as prose, not as a reason code |
| U6.2 | Rewrite ship `summary` composition so it reads: hull/heritage clause, then placement clause — instead of today's separate heritage line stacked over the summary | `systems/detail-model.ts:756-769`, `components/detail-panel.tsx:73-74` | screenshot #4's four stacked micro-paragraphs become one |
| U6.3 | Rewrite `AREA_NARRATIVES` and the lighthouse `summary` in the same register; keep every hedge that carries analytical meaning ("cue, not a per-zone reading") | `systems/detail-model.ts:101-107,417-452` | area panel reads as a place |
| U6.4 | Dock and grave summaries get the same one-pass treatment | `systems/detail-model.ts:516-554,772-801` | |
| U6.5 | Verify no rewrite drops a caveat the ledger relies on — the ledger reads `placementEvidence.reason` **raw**, not the narrative, so the two stay independent by construction | `accessibility-ledger.tsx:338` | ledger text unchanged by U6 |

**Voice rules:** present tense, third person, the harbor as narrator. No
exclamation, no second person, no hype. Numbers appear in the reading line or
the record, not mid-sentence, unless the number *is* the story (an active
depeg). Every hedge that exists for analytical honesty survives verbatim.

### U7 — Ambient surfaces and coordination

| # | Task | Verify |
| --- | --- | --- |
| U7.1 | Harbor log and since-last-visit banner: same quiet treatment, and re-check their positions now that the toolbar/search are gone (both were placed to dodge them) | no overlap at 1280×720 or 1920×1080 |
| U7.2 | Zone labels (`pharosville-world.tsx:704-730`) — **do not restructure**. The world plan's W2.9 re-anchors them. Restrict changes here to the CSS block `.pharosville-observatory-label` and coordinate before touching the JSX | no merge conflict with the world branch |
| U7.3 | Re-check `.pharosville-hud`, `--pv-detail-dock` offsets and the `top: 84px` / `top: 96px` stack now that two surfaces are gone — the panel can sit higher and the composition gains its top-left back | panel anchoring at all four dock sides still clamps in-frame |
| U7.4 | `WorldStaticOverview` (renderer-failure fallback) inherits the same quiet skin so the failure path doesn't look like the old build | force `?renderer=fail` path per `TESTING.md` |

### U8 — Contracts, tests, docs

| # | Task | Verify |
| --- | --- | --- |
| U8.1 | Rewrite `src/content/pharosville-controls.ts`: drop `find-ship`, `follow-selected`, `set-session-hour`, `return-to-preset`, `toggle-auto-cycle`; keep the four group ids (`inspect`/`camera`/`time`/`panels` are pinned by `pharosville-controls.test.ts:6-13`) and keep `PHAROSVILLE_CONTROL_ACTIONS.length > 10` — add the keyboard equivalents that replace the deleted buttons rather than shrinking below the floor | `npm test` |
| U8.2 | Update Playwright specs: remove the two search interactions (`pharosville.spec.ts:134`, `pharosville-performance.spec.ts:460`) and the follow-selected block (`:215-224,275`); keep the `Reset view` clicks working against the cluster button | `npm run test:visual` |
| U8.3 | Detail-panel assertions (`pharosville.spec.ts:202-213`, `pharosville-gates.spec.ts:246,270`) explicitly open the record before asserting "Currently"/"Home dock"/"Chains" — `toContainText` would still match collapsed `<details>` text, but the test should state the intent | `npm run test:visual` |
| U8.4 | Add an `@visual-accessibility` case: hover cluster reachable and operable by keyboard alone, and visible while focused | `npm run test:visual:accessibility` |
| U8.5 | `VISUAL_INVARIANTS.md` — add a short "Interface" subsection under Accessibility And Motion recording DU1–DU7, and amend `:145-148` (the interaction contract currently names "toolbar controls, search, follow-selected"). **Sequence after** the world plan's W7.1 rewrite to avoid a conflicting edit | `npm run validate:docs` |
| U8.6 | Update `docs/pharosville/KNOWN_PITFALLS.md` if the disclosure introduces a focus-order trap, and `AGENT_ONBOARDING.md` routing if component names changed | `npm run check:doc-paths-and-scripts` |
| U8.7 | Bundle check — this workstream should be net negative (two components and ~120 CSS lines deleted, one small component added) | `npm run check:bundle-size` |
| U8.8 | Full lane before any claim of done | `npm run validate` |

---

## 4. Sequencing

```
Phase 0   U1  Remove the chrome                    ← biggest deletion, do first
              exit: bare world + footer + panel, lint/typecheck/test green

Phase 1   U2 cluster  ║  U3 footer  ║  U4 panel structure   ← independent
              (U4 is the long pole)

Phase 2   U5 quiet skin  →  U6 copy                ← U5 needs U4's markup
                                                     U6 reads best against U5

Phase 3   U7 ambient + coordination  →  U8 tests, docs, validate
```

Estimated: Phase 0 is half a session, Phase 1 one session (U4 dominates),
Phase 2 half, Phase 3 half.

**Coordination with the world revamp (UF9):**

- Work in a separate worktree — `npm run worktree:new` — and rebase onto the
  world branch's commits before U7/U8.
- Only two files are genuinely shared: `src/pharosville-world.tsx` (they touch
  `:704-730` only) and `VISUAL_INVARIANTS.md` (they rewrite; U8.5 goes second).
- `src/systems/detail-model.ts` (U6) is **not** on their file list; `unique-ships.ts`
  is theirs. No overlap.
- Their W7.6 re-baselining and W7.7 performance run happen after both land, so
  U8.8's `npm run validate` is the interface stream's own gate, not theirs.

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Hover-revealed controls are undiscoverable | Medium | High | U2.3's post-input reveal, plus the legend's Controls cheatsheet, plus keyboard equivalents. If the operator finds them too shy, raise idle opacity — the mechanism is one CSS value |
| Deleting search makes 187 ships unfindable by name | Medium | Medium | Tab-cycling and the ledger remain; per operator direction. If regretted, the cleanest re-entry is a ⌘K palette, not the old bar — noted, not built |
| Prose-first reads as "data was removed" | Medium | Medium | The disclosure is on the first screen and labelled; U4.4 makes it sticky per session; the ledger is unchanged |
| Copy rewrite (U6) drifts an analytical caveat | Low | **High** | UF-verified: the ledger reads raw evidence strings, never the narrative. U6.5 asserts it. Every hedge is carried verbatim |
| Idle-opacity controls fail WCAG 1.4.11 | Medium | Medium | §2.5 floor + scrim; the contrast script is the check; raise opacity rather than weaken the guard |
| Merge conflict with the world revamp in `pharosville-world.tsx` | Medium | Low | Separate worktree; U7.2 forbids touching the zone-label JSX; rebase before Phase 3 |
| Removing "Copy link" loses shareability | Low | Low | The URL stays live via `replaceWorldUrlState`; address-bar copy works. Flagged for the operator in U3 |
| Deleted Playwright interactions hide a real regression | Low | Medium | U8.4 adds a keyboard-operability case; the follow path keeps its deep-link test |

---

## 6. Explicitly out of scope

- The Three.js world, renderer, materials, sea regions, fleet, lighthouse — the
  parallel plan owns all of it.
- The desktop/portrait viewport gate and `desktop-only-fallback.tsx`.
- Data fetching, `/api/*` allowlist, secret handling.
- Analytical meaning: no fact changes meaning, no encoding changes. This plan
  changes *presentation and hierarchy* only.
- The accessibility ledger's content (it is the parity surface and stays whole).
- Any manual tag or GitHub Release; release flow stays with
  `.github/workflows/release.yml`.

---

## 7. Validation

While iterating:

```bash
npm run validate:changed
```

Before claiming done:

```bash
npm run typecheck && npm run lint && npm test
npm run check:pharosville-colors
npm run test:visual
npm run test:visual:accessibility
npm run validate
```

Deployed check (operator-run, after the world work also lands):

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch
```

---

## 8. Open items for the operator

1. **Cluster placement.** §2.5 proposes bottom-right above the footer. Bottom-centre
   and top-right are both viable; this wants a live look against the new world
   composition rather than a decision on paper.
2. **Footer removals.** "Copy link" and the "Pharos" outbound link are gone per
   direction #3 — confirm at review, since both are cheap to keep.
3. **Ship-count phrasing.** The footer currently reads `122 ships docked / 187
   total`. Once the world plan's W3.5 wires real berth occupancy this number
   starts moving; `122/187` as a bare fraction would be quieter. Operator's call
   at review.
