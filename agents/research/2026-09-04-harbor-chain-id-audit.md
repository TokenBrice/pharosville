# Harbor chain-id audit — is one normalization boundary sufficient?

**Date:** 2026-09-04 · **Lane:** ChainIdAudit (parallel to the contract/coherence lane) ·
**Object under test:** `agents/epic-harbor-plan.md` §2 D8 and §8 L6 ·
**Method:** full enumeration of chain-identifier consumers in `src/**` + `shared/**`, plus a
read-only reproduction through the real modules (`npx tsx outputs/chain-id-audit/repro.ts`,
verbatim output in §4). No source files were modified.

## 0. Verdict

**The single boundary at `buildWorldScaffoldStage`
(`src/systems/pharosville-world/stages/world-scaffold.ts:394-395`) is the right and complete
normalization point for everything fed by the chains payload** — because `useChains()` has
exactly one consumer (`src/hooks/use-pharosville-world-data.ts:106`) and every dock-side
chain id in the world model descends from that one call. But "sufficient" needs three
qualifications the plan does not currently state:

1. **`CHAIN_FLAG_FIELD` must be re-keyed in the same change** (L6's Fix column already says
   this; D8's row alone does not). It is a *table*, not a boundary — but without it the
   boundary inverts the dye defect instead of fixing it.
2. **The mint-burn `scope.chainIds` join is a real bypass** (`src/systems/pharosville-world/stages/cargo-tide.ts:188-194`):
   it compares upstream scope ids against `dock.chainId`. Today raw==raw matches;
   canonicalizing only the docks side can *newly* break it. Either normalize
   `scope.chainIds` at cargo-tide ingestion or verify the upstream vocabulary is canonical.
3. **`resolveChainId` returns `null` for unknown ids** (`shared/lib/chains.ts:179`). The
   boundary must pass unknowns through verbatim (`resolveChainId(id) ?? id`), or every chain
   absent from `CHAIN_META` silently leaves the generic fill pool and the §4 coverage
   property loses its substitute chains.

One plan assertion is **refuted as a description of today's code**: D8's "a raw upstream key
silently nulls `healthFactors`, `change24hPct` and `change7dPct`" — the current join is
self-consistent (both sides read the same payload object), so a raw id *resolves* today
(§4-B). The statement is true only for the partial fix D8 is guarding against (§4-B2
reproduces exactly that). D8's prescription is correct; its symptom description is wrong.

One defect **stronger than anything in L6** was found and reproduced: with a raw feed id,
**no ship ever moors at the Hyperliquid dock** — the ship-side join runs on canonicalized
ids and misses the raw dock id entirely (§4-C). The boundary heals this; the plan never
mentions it.

## 1. Where chain ids enter the app

| Entry | Path | Normalized? |
| --- | --- | --- |
| Chains payload (`ChainSummary.id`) | upstream `api.pharos.watch` → edge proxy (`functions/api/[[path]].ts:47,62`) → `useChains()` (`src/hooks/use-chains.ts:3-5`) → `buildPharosVilleWorld` (`src/hooks/use-pharosville-world-data.ts:106` → `src/systems/pharosville-world.ts:15-16`) | **No** — zod passes `id` through as a bare string (`shared/types/chains.ts:48-49`); sole app consumer is the world build |
| Stablecoin payload (`asset.chainCirculating` keys) | same proxy → `useStablecoins()` → `buildShipsStage` | **Yes** — `canonicalizeChainCirculating` applies `resolveChainId` per key (`shared/lib/chain-circulating.ts:27`, consumed at `src/systems/pharosville-world/stages/ship-placement.ts:112`) |
| Mint-burn payload (`scope.chainIds`) | same proxy → `useMintBurnFlows()` → `buildCargoTideStage` | **No** — opaque upstream strings (`shared/types/mint-burn.ts:20-23`), joined raw against dock ids (`cargo-tide.ts:188-194`) |
| Logo filename (`chain.logoPath`) | chains payload | n/a — slug domain, see §3 |

That the production chains payload carries the raw `hyperliquid-l1` key is established
in-repo by the three defensive keyings built for it — `CHAIN_FLAG_FIELD["hyperliquid-l1"]`
(`src/three/garden-chain-flag.ts:192`), `VENDORED_CHAIN_MARKS` (`src/systems/chain-docks.ts:117`)
and the dual `LEGACY_STATION_BY_CHAIN` entry (`src/three/garden-docks.ts:150`) — plus
`CHAIN_ALIASES` itself (`shared/lib/chains.ts:110`). Whether *other* alias spellings (e.g.
`"OP Mainnet"`) also arrive in `ChainSummary.id` is `[INFERENCE]` — no live sample is
checked into the repo; the code path is proven regardless (§4-D).

## 2. Consumer table

Classification: **canonical** = must receive a `CHAIN_META` id; **raw** = must receive the
upstream key as-is; **slug** = keyed on the logo filename slug; **agnostic** = any
consistent string works. "Breaks on mismatch" describes the miss direction.

### 2.1 Dock-side selection (read `inputs.chains` via the scaffold)

| Consumer | Path:line | Class | Breaks on mismatch |
| --- | --- | --- | --- |
| `SUPPRESSED_CHAIN_HARBOR_IDS.has(chain.id)` | `src/systems/chain-docks.ts:17`, checked `:160` | canonical | suppressed chain **renders a dock** and steals a slot (§4-D) |
| `PIGEONNIER_HARBOR_CHAIN_ID_SET.has(chain.id)` | `src/systems/chain-docks.ts:23`, checked `:161`; ids `src/systems/world-layout.ts:193` | canonical (`ton`) | chain competes for standard slots; pigeonnier lookup `:183-184` misses too |
| `ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS` loop (`byId.get`) | `src/systems/chain-docks.ts:166-169`; ids `world-layout.ts:64-67` | canonical | priority reservation silently skipped |
| `PREFERRED_DOCK_STATIONS[chainId]` | `src/systems/chain-docks.ts:189`; table `world-layout.ts:126-146` (`hyperliquid` at `:143`) | canonical | chain lands on a fill mouth wearing the wrong archetype (§4-A) |
| `EVM_BAY_CHAIN_IDS.has(chainId)` pool pick | `src/systems/chain-docks.ts:192`; set `world-layout.ts:154` | canonical | EVM chain draws from the outer pool |
| `withChainSignals` `byChainId.get(dock.chainId)` | `src/systems/pharosville-world/stages/world-scaffold.ts:381-383` | agnostic *today* (both sides read the same object — §4-B); miskeyed under a docks-only partial fix (§4-B2) | signals null (only under partial fix) |
| `buildSupplyTide` | `src/systems/supply-tide.ts:79-84` | **not chain-keyed** — reads only `globalChange7dPct` | nothing; D8's "three consumers" is harmless overkill here |
| `dock.id` / `dock.detailId` = `dock.${chain.id}` | `src/systems/chain-docks.ts:135,154` | agnostic | user-visible id string changes once (R10-style churn, self-invalidating) |

### 2.2 Downstream `dock.chainId` consumers (all healed by the scaffold boundary)

| Consumer | Path:line | Class | Breaks on mismatch |
| --- | --- | --- | --- |
| `CHAIN_FLAG_FIELD[dock.chainId]` (flag dye) | `src/three/garden-chain-flag.ts:185-202` (`"hyperliquid-l1"` at `:192`), reached via `:144,163,221` | **raw today** — the one raw-keyed casualty of the rename | canonical feed → brand dye miss, falls back to health accent (§4-A); MUST be re-keyed to `hyperliquid` (L6 already mandates) |
| `LEGACY_STATION_BY_CHAIN[dock.chainId]` | `src/three/garden-docks.ts:142-155` (dual keys `:149-150`), consumed `:1611` | either (dual-keyed) | tolerant; the `-l1` entry becomes dead code after normalization |
| `fallbackStationType` + `stableUnit` jitter seeds | `src/three/garden-docks.ts:1623-1626`, `:355`, `:1715-1717`, `:1747-1749` | agnostic | spelling change alters deterministic jitter (cosmetic, one rebuild) |
| `chainInitials(dock.label \|\| dock.chainId)` | `src/three/garden-chain-flag.ts:238`, `:276-281` | name-based | none (label wins; name unchanged by normalization) |
| atlas `cellByChainId` cache | `src/three/garden-chain-flag.ts:133,152` | agnostic | cell re-assigned once |
| `dockHarborGroupLabel` (ethereum + L2 literals) | `src/systems/detail-model.ts:196-201`, set `:168` | canonical | label degrades to "Rim-cove shore station" (soft; L8 rewords this anyway) |
| `chainLabel` = `CHAIN_META[chainId]?.name ?? chainId` | `src/systems/detail-model.ts:155-157`, used `:210-211` | canonical | raw id string shown in UI presence rows (soft) |
| Chain route link `/chains/${node.chainId}/` | `src/systems/detail-model.ts:900`; `src/systems/route-links.ts:4-8` | canonical | links off-site to a page keyed by the canonical slug `[INFERENCE]` — `route-links.test.ts:11` pins `ethereum` |
| causeway district chain match | `src/three/garden-harbor-life.ts:322-324,331,341` (ethereum literal + `ETHEREUM_L2_DOCK_CHAIN_IDS`) | canonical | no causeway (moot — plan Phase 3 deletes the producer) |
| accent/flag runtime retarget | `src/three/world-renderer.ts:2353-2368,4319-4333,4832-4841`; `src/three/garden-harbor-batch.ts:124-144,184-197,366` | agnostic | internal consistency only (key and probe both `recipe.dock.chainId`) |
| render content signature | `src/systems/world-render-content-signature.ts:31` | agnostic | one cache invalidation |
| quick-find candidates | `src/systems/quick-find-match.ts:30-33` (labels from `entityById`) | name-based | none |

### 2.3 Cross-payload joins (where two vocabularies meet)

| Consumer | Path:line | Class | Breaks on mismatch |
| --- | --- | --- | --- |
| **ship mooring join** `dockByChainId.get(presence.chainId)` | `src/systems/pharosville-world/stages/dock-assignment.ts:186,200,229`; presence built at `ship-placement.ts:111-123` (`hasRenderedDock` `:122`, `homeDockChainId` `:418`) | dock side must equal canonical presence ids | **raw dock id → zero dock visits, dark berth, `homeDockChainId: null`** (§4-C) — the strongest functional defect, absent from L6 |
| **cargo-tide scope join** `scope.has(dock.chainId)` | `src/systems/pharosville-world/stages/cargo-tide.ts:179-197` (`trackedChainIds` `:192-194`), presence join `:217,225,244` | dock side must equal upstream `scope.chainIds` | today raw==raw; canonical docks vs raw scope → every affected harbour reports `chain-not-in-scope` and its tide goes dark. Upstream vocabulary `[INFERENCE]` (fixture: `["ethereum"]`, `src/__fixtures__/pharosville-world.ts:282`; comment: `["ethereum","arbitrum"]`, `cargo-tide.ts:35`) |
| motion visit re-find `entry.id === visit.dockId && entry.chainId === visit.chainId` | `src/systems/motion-planning.ts:661`, `:687` | agnostic | consistent post-assignment |

### 2.4 Ship-side / shared (already canonical or display-only)

| Consumer | Path:line | Class | Notes |
| --- | --- | --- | --- |
| `canonicalizeChainCirculating` | `shared/lib/chain-circulating.ts:17-53` (`resolveChainId` `:27`) | normalizer | the pre-existing second boundary; must survive the plan unchanged |
| `CHAIN_PENNANT_HUES[ship.dominantChainId]` | `src/three/garden-ships.ts:655-677` | canonical | no `hyperliquid` entry — fallback grey is by design, not an id defect |
| `CHAIN_META`, `CHAIN_RESILIENCE_TIER`/`getChainResilienceTier`, `CHAIN_NAME_TO_ID`, `resolveChainId` | `shared/lib/chains.ts:8-106,132-151,156-159,167-180` | canonical | tier helper has no src consumers today |
| `topChains[].chainId` (digest), blacklist `chainId`/`chainName` | `shared/types/digest.ts:141-144`; `shared/types/market.ts:474-476,498-500` | display | not joined against docks |
| ledger scope prose `scopeChainIds.join(", ")` | `src/components/accessibility-ledger.tsx:430-431` | display | verbatim echo, no join |

### 2.5 The slug case

`VENDORED_CHAIN_MARKS` / `vendoredChainMark` (`src/systems/chain-docks.ts:110-131`) is the
**only** consumer keyed on a logo filename slug — it strips the slug from `logoPath`
(`:129`), never touches `chain.id`. **It is the only slug consumer found, and it is
rename-safe**: normalization changes `chain.id` but not `logoPath`, so `hyperliquid-l1`
still hits (reproduced under both feed ids, §4-A — the `.svg` rewrite fires either way).
A blanket rename that also rewrote this set would break the mark, exactly as L6 warns.
Latent note, no action: the set contains `hyperliquid-l1` and not `hyperliquid`, so it
depends on the upstream filename staying put; a miss falls back to the painted mark, which
is the designed outcome.

### 2.6 Fixtures and gates (why nothing catches this today)

Every fixture uses canonical ids — the dense fixture's chain list
(`src/__fixtures__/pharosville-world.ts:303-314`) does not contain `hyperliquid` at all,
and the browser-level dock-id gate pins canonical ids (`tests/visual/pharosville.spec.ts:384-396`).
The raw spelling only exists in production payloads.

## 3. The single-boundary test

Reachability: `useChains()` → one consumer → `buildPharosVilleWorld` → `buildWorldScaffoldStage`
→ `buildChainDocks` + `withChainSignals` + `buildSupplyTide` (`world-scaffold.ts:394-397`);
every dock-side consumer in §2.2 reads `dock.chainId` produced there; ships/dock-assignment/
cargo-tide/detail-index all consume `scaffold.docks` (`src/systems/pharosville-world.ts:16-44`).
**No canonical-required consumer receives a chains-payload id by any path that bypasses the
scaffold object.** The bypasses that exist are:

- **B1 — ship/stablecoin payload** (`ship-placement.ts:112`): carries chain ids, but its own
  boundary (`chain-circulating.ts:27`) already canonicalizes. Not healed *by* the scaffold
  boundary but *joined correctly once docks are canonical* (§4-C).
- **B2 — mint-burn `scope.chainIds`** (`cargo-tide.ts:188-194`): a separate response whose
  ids are compared against `dock.chainId` with no normalizer. The scaffold boundary changes
  one side of this join; if the upstream scope ever lists a raw spelling, that harbour's
  tide silently goes `chain-not-in-scope`.
- **B3 — fixtures/tests** (§2.6): canonical-only; they bypass nothing but also prove nothing.

**Minimum boundary set:** (1) the scaffold `ChainsResponse` copy — with
`resolveChainId(id) ?? id` pass-through so unknown chains keep filling the generic pool
(`selectChainHarbors` fills from any id, `chain-docks.ts:171-174`; dropping nulls would
shrink the pool and can unbind mouths on feeds whose substitutes are unlisted chains);
(2) `CHAIN_FLAG_FIELD` re-keyed to `hyperliquid` (table, same change); (3) normalize
`mintBurn.scope.chainIds` at cargo-tide ingestion **or** assert the upstream vocabulary is
canonical (R9's focused test is the natural place). Also state a dedupe policy for the
pathological feed that carries both spellings: selection is Map-keyed
(`chain-docks.ts:163-168`), so two entries would collapse inconsistently — keep the larger
`totalUsd` (or sum) rather than relying on insertion order.

## 4. Reproduction (verbatim, `npx tsx outputs/chain-id-audit/repro.ts`)

Real modules throughout: `buildChainDocks`, `buildWorldScaffoldStage` (which calls the
private `withChainSignals`), `assignGardenChainFlagCell` under a recording canvas stub
(the dye hex is the first full-cell `fillRect` fill), `canonicalizeChainCirculating`,
`buildDockAssignmentStage`, `resolveChainId`. Feed: 9 named chains + optimism;
`logoPath` keeps the upstream `hyperliquid-l1` filename in both runs; sentinel fallback
accent `#123456`.

```text
=== A. buildChainDocks + flag dye, feed id varied ===
-- feed entry id = "hyperliquid" --
  docks rendered                                 9
  hyperliquid dock present                       true
  PREFERRED_DOCK_STATIONS[feed id] direct hit    true
  landed on hyperliquid preferred tile           true
    actual tile / expected                       (131,59) / (131,59)
    cove / station.type                          danger-gorge / fishing-pier
  logoPath after vendored rewrite                /chains/hyperliquid-l1.svg
  flag dye                                       cell=0 field=#123456 dye=MISS -> fallback #123456
-- feed entry id = "hyperliquid-l1" --
  docks rendered                                 9
  hyperliquid dock present                       true
  PREFERRED_DOCK_STATIONS[feed id] direct hit    false
  landed on hyperliquid preferred tile           false
    actual tile / expected                       (122,132) / (131,59)
    cove / station.type                          watch-south-reed / reed-boathouse
  logoPath after vendored rewrite                /chains/hyperliquid-l1.svg
  flag dye                                       cell=0 field=#97fce4 dye=HIT (#97fce4 brand mint)
=== B. withChainSignals via buildWorldScaffoldStage (real boundary) ===
-- feed entry id = "hyperliquid" --
  healthFactors.concentration                    0.42
  healthFactors (object resolved)                true
  change24hPct                                   2.5
  change7dPct                                    -1.25
-- feed entry id = "hyperliquid-l1" --
  healthFactors.concentration                    0.42
  healthFactors (object resolved)                true
  change24hPct                                   2.5
  change7dPct                                    -1.25
=== B2. partial fix: normalized docks + raw chains (replicated join) ===
  docks from RAW feed + raw chains object        {"chainId":"hyperliquid-l1","healthFactors":true,"change24hPct":2.5,"change7dPct":-1.25}
  docks from NORMALIZED feed + raw chains object {"chainId":"hyperliquid","healthFactors":false,"change24hPct":null,"change7dPct":null}
=== C. ship presence (canonicalized) vs dock.chainId ===
  canonicalizeChainCirculating key               hyperliquid
  raw hyperliquid-l1: dockVisits for ship on "hyperliquid" 0 — join MISSED (ship never moors at the Hyperliquid dock)
  normalized: dockVisits for ship on "hyperliquid" 1 — join hit (dockId dock.hyperliquid)
=== D. SUPPRESSED_CHAIN_HARBOR_IDS vs alias ids ===
  resolveChainId("OP Mainnet")                   optimism
  resolveChainId("Kaia")                         klaytn
  resolveChainId("hyperliquid-l1")               hyperliquid
  feed optimism id "optimism"                    suppressed — no dock
  feed optimism id "OP Mainnet"                  RENDERS dock dock.OP Mainnet at (122,132) — suppression MISSED
```

Notes on reading §4:

- **A** confirms L6's four-way exactly: canonical id → preferred berth (131,59) but dye
  miss; raw id → dye hit but the preferred lookup misses and the chain falls to
  `firstOpenSlot`, here `watch-south-reed` (122,132) — *Solana's* berth, whose
  `reed-boathouse` archetype it then wears. Which fill mouth it lands on is feed-dependent
  (in a first draft of this feed the fill mouth happened to coincide with the preferred
  tile — the plan's own "apparent correctness is coincidence" point, demonstrated).
  The vendored-mark rewrite (`.svg`) fires under **both** ids, proving §2.5 rename-safety.
- **B** refutes "a raw id silently nulls the signals" *for today's code*: the join is
  self-consistent because `withChainSignals(buildChainDocks(inputs.chains), inputs.chains)`
  reads one object on both sides (`world-scaffold.ts:395`).
- **B2** (12-line inline replica of the private join, labeled as such) confirms D8's actual
  guard: normalizing only the docks side nulls all three fields. D8's "one object to all
  consumers" prescription is therefore correct and necessary.
- **C** is the unreported defect: ship presence ids are canonicalized
  (`chain-circulating.ts:27`), so a raw dock id yields **zero moorings** — the harbour
  renders with a dark berth and hyperliquid-dominant coins get `homeDockChainId: null`
  (`ship-placement.ts:122,418`). The scaffold boundary heals it (1 visit, `dock.hyperliquid`).
- **D** proves the general-alias path: `"OP Mainnet"` escapes `SUPPRESSED_CHAIN_HARBOR_IDS`
  **and** steals `watch-south-reed` from the generic pool; `resolveChainId` maps it to
  `optimism`, so the D8 boundary also fixes the suppression leak.

## 5. Other alias victims (`CHAIN_ALIASES`, `shared/lib/chains.ts:109-120`)

Of the nine aliases, only two canonical ids sit in a hard-keyed table:

- `hyperliquid` — `PREFERRED_DOCK_STATIONS` (`world-layout.ts:143`): both halves reproduced (§4-A).
- `optimism` (via `"OP Mainnet"`) — `SUPPRESSED_CHAIN_HARBOR_IDS` (`chain-docks.ts:17`):
  suppression leak + slot theft reproduced (§4-D). The interaction is real in the miss
  direction: suppression is checked against the **raw** feed id (`chain-docks.ts:160`), so
  any non-canonical spelling of Optimism renders it; normalization makes the suppression
  effective. Whether the live payload carries `"OP Mainnet"` (display name) or a slugified
  `"op-mainnet"` is `[INFERENCE]` — note the latter defeats even `resolveChainId` (no alias,
  no name match), which is exactly why the unknown-id pass-through of §3 matters.
- `Kaia`→klaytn, `zkSync Era`→zksync, `Plume Mainnet`→plume, `XRPL`→xrpl, `Bsquared`→bsquared,
  `Secret`→secret, `Redbelly`→redbelly — none of these canonical ids appear in
  `PREFERRED_DOCK_STATIONS`, `PIGEONNIER_HARBOR_CHAIN_IDS`, `SUPPRESSED_CHAIN_HARBOR_IDS`,
  `EVM_BAY_CHAIN_IDS` or the priority list, so today they can only hit the *soft* consumers:
  `chainLabel` falls back to the raw string in UI rows (`detail-model.ts:155-157`), the
  off-site chain link uses the raw slug (`detail-model.ts:900`), and dye/pennant fall back
  by design for non-vendored chains. **Hyperliquid is therefore one instance of a general
  defect class, but the only alias with a hard preferred-berth victim today; optimism is
  the second hard interaction (suppression).** Normalizing at the scaffold fixes the whole
  class for the chains payload at once.

## 6. Findings for the plan (ordered by severity)

1. **[missing from plan] Dark-berth defect**: raw feed id ⇒ zero ship moorings at that
   harbour (`dock-assignment.ts:186,200,229` vs `ship-placement.ts:112,122`; §4-C). The
   D8 boundary fixes it — the plan should claim this, since it is a stronger user-visible
   failure than either half of L6.
2. **[plan must add] cargo-tide scope join** (`cargo-tide.ts:188-194`) is the one bypass of
   the scaffold boundary; canonicalizing docks can newly darken tides if upstream
   `scope.chainIds` are raw. Normalize scope at ingestion or gate on the upstream
   vocabulary (extends R9).
3. **[plan must state] unknown-id pass-through** `resolveChainId(id) ?? id`
   (`chains.ts:179` returns null): dropping nulls shrinks the generic fill pool and can
   unbind mouths — the §4 coverage property depends on unlisted chains surviving.
4. **[correction] D8's symptom is wrong for today's code**: a raw id does *not* null
   `healthFactors`/`change24hPct`/`change7dPct` today (§4-B); it would only under the
   docks-only partial fix D8 rules out (§4-B2). Keep the prescription, fix the sentence.
5. **[confirmed] L6's fix set is exactly right**: normalize at the boundary, re-key
   `CHAIN_FLAG_FIELD` to `hyperliquid`, leave `VENDORED_CHAIN_MARKS` alone (sole slug
   consumer, rename-safe — reproduced). Add cleanup of the now-dead
   `LEGACY_STATION_BY_CHAIN["hyperliquid-l1"]` entry (`garden-docks.ts:150`) to Phase 3's
   rename list.
6. **[minor] dedupe policy** for a feed carrying both spellings (Map-keyed selection,
   `chain-docks.ts:163-168`) — one sentence in D8.
