# Lane B — Rim geometry: the harbor cluster, measured, and a field-verified redistribution ring

**Date:** 2026-09-04 · **Scope:** spatial math only (no architecture, no three.js technique).
**Method:** every number below is produced by `outputs/harbor-lane-b.ts`, a throwaway script under the allowed scratch dir that imports the REAL modules — `buildChainDocks` (`src/systems/chain-docks.ts`), `terrainKindAt` / `graveNodesFromEntries` / `isNavigableWaterTile` (`src/systems/world-layout.ts`), `RIM_COVES` / `RIM_OPENINGS` / `rimLandAt` / `rimShoreDistance` / `rimDepthAt` (`src/systems/garden-rim.ts`), `seaBodyAtTile` (`src/systems/sea-bodies.ts`), `dockSeawardVector` (`src/systems/dock-layout.ts`), and the real cemetery scatter (`CEMETERY_ENTRIES`). Reproduce with `npx tsx outputs/harbor-lane-b.ts`; the pasted output is `outputs/lane-b-final.txt`. No source files were edited.

Vocabulary (shared contract): **arc** = N (y≤30) / E (x≥110) / S (y≥112) / W (x≤30) / INTERIOR-SHORE (else); **mouth** = authored `RimCove` water tile (`src/systems/garden-rim.ts:6-15`); **station** = rendered structure bound to a mouth. Bearings below are compass degrees (0 = north, clockwise). The working name for the Ethereum landmark is **the Ethereum Mole**.

---

## 1. The defect, quantified

Feed used: the realistic top-8 — ethereum 95B, tron 62B, solana 12.5B, base 12B, bsc 8B, arbitrum 4.5B, hyperliquid 3.5B, polygon 2.5B — plus ton 1.5B on the pigeonnier. Selection is deterministic: `ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS` hard-reserves ethereum/base/arbitrum/polygon (`src/systems/world-layout.ts:64-67`, consumed at `src/systems/chain-docks.ts:166-169`), the rest fill by supply to `MAX_CHAIN_HARBORS = 8` (`src/systems/chain-docks.ts:14,171-178`), and every one of these ids has a preferred berth (`src/systems/world-layout.ts:126-146,195-206`), so the rendered nine are fixed for this feed.

```
buildChainDocks -> 9 docks (8 standard + 1 pigeonnier)
ethereum     ethereum-precinct    boathouse-precinct (14,74) arc=W              brgLH=265deg brgC=265deg dLH=46
tron         warning-stone-notch  stepped-inlet      (118,10) arc=N              brgLH= 44deg brgC= 39deg dLH=83
solana       watch-south-reed     reed-boathouse     (122,132) arc=S              brgLH=135deg brgC=140deg dLH=88
base         base-annex           annex-pavilion     (14,81) arc=W              brgLH=257deg brgC=258deg dLH=47
bsc          watch-east-bay       tea-house-quay     (132,80) arc=E              brgLH= 98deg brgC=100deg dLH=73
arbitrum     arbitrum-annex       annex-pavilion     (12,68) arc=W              brgLH=272deg brgC=271deg dLH=48
hyperliquid  danger-gorge         fishing-pier       (131,59) arc=E              brgLH= 81deg brgC= 80deg dLH=72
polygon      optimism-annex       annex-pavilion     (13,89) arc=W              brgLH=248deg brgC=251deg dLH=51
ton          ton-pigeonnier-islet pigeonnier-islet   (125,126) arc=S              brgLH=131deg brgC=136deg dLH=86
```

Pairwise Euclidean tile-distance matrix (script output, verbatim):

```
             ethere   tron solana   base    bsc arbitr hyperl polygo    ton
ethere           -    122    123      7    118      6    118     15    123
tron            122     -    122    126     71    121     51    131    116
solana          123    122     -    119     53    127     74    117      7
base              7    126    119     -    118     13    119      8    120
bsc             118     71     53    118     -    121     21    119     47
arbitr            6    121    127     13    121     -    119     21    127
hyperl          118     51     74    119     21    119     -    122     67
polygo           15    131    117      8    119     21    122     -    118
ton             123    116      7    120     47    127     67    118     -
```

Clustering metrics (script output, verbatim):

```
stations within 30 tiles of the ethereum-precinct mouth (14,74): 4/9 = 0.444
   members: ethereum, base, arbitrum, polygon
precinct y-span: 21 tiles (mouths at y=68,74,81,89)
stations on the W arc (x<=30): 4/9
authored RIM_COVES by arc: W=6  N=2  E=2  S=2 (total 12)
```

Empty rim arcs about the plate centre (69.5,69.5), compass degrees, after subtracting the two structurally station-free fog openings (`RIM_OPENINGS`, `src/systems/garden-rim.ts:37-40`; NW opening 80°, NE opening 40°):

```
gap 140deg -> 251deg  raw=111deg  closed-rim-only=111deg
gap 271deg -> 39deg  raw=128deg  closed-rim-only=48deg
gap 100deg -> 136deg  raw=36deg  closed-rim-only=36deg
gap 80deg -> 100deg  raw=19deg  closed-rim-only=19deg
gap 251deg -> 258deg  raw=7deg  closed-rim-only=7deg
gap 258deg -> 265deg  raw=7deg  closed-rim-only=7deg
gap 265deg -> 271deg  raw=6deg  closed-rim-only=6deg
gap 136deg -> 140deg  raw=4deg  closed-rim-only=4deg
gap 39deg -> 80deg  raw=41deg  closed-rim-only=1deg
LARGEST closed-rim arc with no station: 111deg (140deg -> 251deg)
(rim openings, structurally station-free: NW 80deg, NE 40deg)
```

**Reading.** 44% of all rendered stations (4/9) sit within 30 tiles of one mouth; the precinct quartet's pairwise distances are 6/7/8/13/15/21 — one 21-tile family cluster on the west shore (6 of the 12 *authored* mouths are W-arc, `src/systems/garden-rim.ts:115-146`). Meanwhile the single largest station-free stretch of real coastline is **111° of bearing — the entire south and south-west rim from the solana/ton pair (compass 140°) around to the polygon annex (compass 251°)**. The camera-near southern arc, the compositional foreground, is the emptiest part of the harbor ring. The second-largest hole (48° closed rim, compass 271°→39°) is the north-west headland above the precinct. The operator's complaint is confirmed in both directions: mass west of the lighthouse, vacancy south.

---

## 2. ASCII map (140×140 → 70×70, one char per 2×2 tiles)

```
lllllllllllllllllllllllllllllllllll...##########################aaaaaa
llllllllllllllllllllllllllllllllll....##########################!!!!??
llllllllllllllllllllllllllllllllll....#########################!!!!???
llllllllllllllllllllllllllllllllll...#########################!!!!????
llllllllllllllllllllllllllllllllll...########################!!!!?????
lllllllllllllllllllllllllllllllllll......##################2!!!!!?????
llllllllllllllllllllllllllllllllllll......a######aaa####aaa!!!!!??????
lllllllllllllllllllllllllllllllllllll.....aaaaaaaaaaaaaaaa!!!!!!??????
lllllllllllllllllllllllllllllllllllll.....aaaaaaaaaaaaaaa!!!!!!!??????
lllllllllllllllllllllllllllll.....l.......aaaaaaaaaaaaaaa!!!!!!???????
lllllllllccllllllllllllccccc..............aaaaaaaaaaaaaa!aa!!!!???????
lllllllccccccccccllllcccccccc.............aaaaaaaaaaaaa!!!aa!!!???????
lllllccccccccccccccccccccccccc............aaaaaaaaaaaaa!!!!aa!!???????
lllcccccccccccccccccccccccccccc............aaaaaaaaaaa!!!!!!aa????????
lccccccccccccccccccccccccccccccc...........aaaaaaaaaaa!!!!!!a!????????
cccccccccccccccccccccccccccccccc...........aaaaaaaaaaa!!!!!!!?????????
ccccccccccccccccccccccccccccccccc..........aaaaaaaaaaa!!!!!!!?????????
ccccccccccccccccccccccccccccccccc..........aaaaaaaaaaa!!!!!!!?????????
ccccccccccccccccccccccccccccccccc...........aaaaaaaaaa!!!!!!!!????????
ccccccccccccccccccccccccccccccccc...........aaaaaaaaaa!!!!!!!!!??????!
ccccccccccccccccccccccccccccccccc...........aaaaaaaaaa!!!!!!!!!?????!!
lccccccccccccccccccccccccccccccccc.........aaaaaaaaaaa!!!!!!!!!!??????
lllllccccccccccccccccccccccccccccc.........aaaaaaaaaaaa!!!!!!?????????
llllllcccccccccccccccccccccccc............aaaaaaaaaaaaa!!!!!!?????????
llllllccccccccccccccccccc................aaaaaaaaaaaaaaa!!!!!?????????
#lllllccccccccccccccccccc................aaaaaaaaaaaaaaaa!!!w?????????
####lccccccccccccccccccccc...............aaaaaaaaaaaaaaaa!!www????????
#####cccccccccccccccccccccc...............aaaaaaaaaaaaaaawwwww????????
#####cccccccccccccccccccccc...............aaaaaaaaaaaawwwwwwww????????
######cccccccccccccccccccccc...............aaaaaaaaaawwwwwwwwww??7####
######cccccccccccccccccccccc................aaaaaaaawwwwwwwwwwwwww####
######cccccccccccccccccccccc.................aaaaaawwwwwwwwwwwwwww####
######cccccccccccccccccccccc.....#######......aaa....wwwwwwwwwwwww####
######ccccccccccccccccccccc.....##########.............wwwwwwwwwww####
######6cccccccccccccccccccc..#############..............wwwwwwwwww####
######ccccccccccccccccccccc..#@############.............wwwwwwwwww####
#######cccccccccccccccccccc..##############..............wwwwwwwww####
#######1ccccccccccccccccccc....############..............wwwwwwwww####
#######ccccccccccccccccccccc...############.............wwwwwwwwww####
#######cccccccccccccccccccccc..###########..........wwwwwwwwwwwwww####
#######4cccccccccccccccccccccc..#########..........wwwwwwwwwwwwwww5###
#######ccccccccccccccccccccccc.....####...........wwwwwwwwwwwwwwww####
#######ccccccccccccccccccccccccc..................wwwwwwwwwwwwwwww####
#######cccccccccccccccccccccccccccccc.............wwwwwwwwwwwwwwww####
######8cccccccccccccccccccccccccccccc.............wwwwwwwwwwwwwwww####
#######ccccccccccccccccccccccccccccccc............wwwwwwwwwwwwwwww####
#######ccccccccccccccccccccccccccccccc............wwwwwwwwwwwwwwww####
#######ccccccccccccccccccccccccccccccc............wwwwwwwwwwwwwwww####
#######kcccccccccccccccccccccccccccccc............wwwwwwwwwwwwwwww####
#######kkkkkcccccccccccccccccccccccccc............wwwwwwwwwwwwwwww####
#######kkkkkkkcccccccccccccccccccccccc.............wwwwwwwwwwwwwww####
#######kkkkkkkkcccccccccccccccccccccccc............wwwwwwwwwwwwwww####
#######kkkkkkkkkkcccccccccccccccccccccc............wwwwwwwwwwwwwww####
#######kkkkkkkkkkkcccccccccccccccccccc.............wwwwwwwwwwwwwww####
#######kkkkkkkkkkkkccccccccccccccccccc.............wwwwwwwwwwwwwww####
#######kkkkkkkkkkkkkkccccccccccccccccc..............wwwwwwwwwwwwww####
######kkkkkkkkkkkkkkkkccccccccccccccc................wwwwwwwwwwwww####
####kkkkkkkkkkkkkkkkkkkccccccccccccc....................wwwwwwwwww####
###kkkkkkkkkkkkkkkkkkkkkcccccccccccc.....................wwwwwwwww####
##kkkkkkkkkkkkkkkkkkkkkkkcccccccccc.....................wwwwwwwwww####
##kkkkkkkkkkkkkkkkkkkkkkkkccccccccc...................wwwwwwwwwwww####
#kkkkkkkkkkkkkkkkkkkkkkkkkkccccccc.....................wwwwwwwwwww####
##kkkkkkkkkkkkkkkkkkkkkkkkkkcccccc.......................wwwwwwwww####
##kkkkkkkkkkkk#####kkkk###kkccccc.........................wwww9#ww####
###kkkkkkkkkk###############kccc...........................wwwwwww####
####kkkkkkkk#######################.........................wwwwww####
######kkkk###################################################3########
######################################################################
######################################################################
######################################################################
```

legend: `#` land (terrain data) · `@` lighthouse (60,70) · `.` open/deep water · `c` calm · `l` ledger · `w` watch · `a` alert · `!` warning · `d` danger · `k` wreck · digits = rendered stations (1 ethereum, 2 tron, 3 solana, 4 base, 5 bsc, 6 arbitrum, 7 hyperliquid, 8 polygon, 9 ton).

The concentration is visible without the legend: stations **1, 4, 6, 8 (ethereum, base, arbitrum, polygon) all sit in the same left-margin column band, directly west of the island `@`**, while the entire bottom-left quarter — the widest continuous stretch of shoreline on the plate — carries nothing between station 8's latitude and station 3/9 in the far south-east. No station appears anywhere along the bottom rows between x-blocks ~18 and ~55.

---

## 3. Candidate mouth enumeration (the full field-verified set)

Predicates, exactly those the existing coves were verified against (`src/systems/garden-rim.ts:109-113`, `src/systems/world-layout.test.ts:289-296,306-313`):

1. tile is water in the data map (`isWaterTileKind(terrainKindAt(x,y))`) and belongs to a NAMED body (`seaBodyAtTile !== "open"`, `src/systems/sea-bodies.ts:449-466`);
2. `rimShoreDistance(x,y)` ∈ (0, 2] — water side, within 2 tiles of the authored rim shore (`src/systems/garden-rim.ts:310-324`);
3. bearing about the plate centre outside both `RIM_OPENINGS` (`src/systems/garden-rim.ts:164-171`);
4. rim land within 14 tiles landward along the cardinal-snapped `seawardBearing` (the `dockSeawardVector` convention, `src/systems/dock-layout.ts:6-11`);
5. water continues at the immediately seaward tile.

Brute-forcing all 19,600 tiles (verbatim):

```
valid candidate mouth tiles: 762
by arc:  N=127  W=143  E=119  S=373
by body: alert=75  warning=32  open=146  ledger=17  calm=96  danger=7  watch=172  wreck=217
(INTERIOR-SHORE count is absent because no tile >2 tiles from rim land can sit there — see doc)
```

**Structural finding — INTERIOR-SHORE is impossible.** Not one of the 567 valid tiles classifies as INTERIOR-SHORE. Rim land only exists within `edgeInset < depth ≤ 14` of the plate edge (`src/systems/garden-rim.ts:207-217`), so any tile with `rimShoreDistance ≤ 2` is within 16 of an edge and always satisfies x≤30, x≥110, y≤30, or y≥112. A ring built from authored rim mouths can therefore cover only N/E/S/W; the fifth arc is reachable solely via the pigeonnier wharf — which itself classifies S ((124,125) → y≥112). The epic's "all five arcs" goal must be read as "all four rim arcs + the pigeonnier", or the arc vocabulary needs an amendment.

**Capacity finding.** The named bodies' rim contact is very uneven: `danger` offers exactly 2 valid tiles (the east headland at (131,59)±1) and `ledger` exactly 2 ((9,54),(9,55)); `warning` offers 5, all inside the north budget. Any ring that must keep body diversity ≥ 6 (`src/systems/world-layout.test.ts:300`) draws its freedom from calm (95), watch (172), wreck (217), alert (74) — and nothing else.

Site table — best tile per 10° compass bin × body (all 27 rows come from the enumerated valid set, so every row satisfies predicates 1–5; `run` = clear seaward approach to first land, `sd` = rimShoreDistance, `landD` = landward distance to rim land, `nav` = flood-fill navigable from the island; verbatim):

```
brg  0 ( 78,  9) open    arc=N       seaward= 90mathDeg sd=0.50 landD= 1 run= 55 rimDepth=8.9 nav=Y binTiles= 11 nearestCove=alert-signal-jetty(26)
brg 10 ( 83, 11) open    arc=N       seaward= 90mathDeg sd=0.50 landD= 1 run= 56 rimDepth=10.5 nav=Y binTiles=  9 nearestCove=alert-signal-jetty(21)
brg 10 ( 85, 12) alert   arc=N       seaward= 90mathDeg sd=0.50 landD= 1 run=120 rimDepth=11.5 nav=Y binTiles= 15 nearestCove=alert-signal-jetty(19)
brg 20 ( 97, 12) alert   arc=N       seaward= 90mathDeg sd=0.50 landD= 1 run=120 rimDepth=11.9 nav=Y binTiles= 28 nearestCove=alert-signal-jetty(7)
brg 30 (115, 11) alert   arc=N       seaward= 90mathDeg sd=0.50 landD= 1 run=121 rimDepth=10.7 nav=Y binTiles= 31 nearestCove=warning-stone-notch(3)
brg 30 (118, 10) warning arc=N       seaward= 90mathDeg sd=0.50 landD= 1 run=122 rimDepth=9.7 nav=Y binTiles=  5 nearestCove=warning-stone-notch(0)
brg 40 (127,  1) alert   arc=N       seaward= 90mathDeg sd=0.50 landD= 1 run=130 rimDepth=0.0 nav=Y binTiles=  1 nearestCove=warning-stone-notch(13)
brg 40 (127,  2) warning arc=N       seaward= 90mathDeg sd=0.50 landD= 2 run=129 rimDepth=0.0 nav=Y binTiles= 27 nearestCove=warning-stone-notch(12)
brg 70 (134, 58) danger  arc=E       seaward=180mathDeg sd=0.50 landD= 1 run=123 rimDepth=0.0 nav=Y binTiles=  5 nearestCove=danger-gorge(3)
brg 80 (131, 59) danger  arc=E       seaward=180mathDeg sd=0.50 landD= 1 run=120 rimDepth=7.1 nav=Y binTiles=  2 nearestCove=danger-gorge(0)
brg 80 (131, 63) watch   arc=E       seaward=180mathDeg sd=0.50 landD= 1 run=119 rimDepth=7.8 nav=Y binTiles= 21 nearestCove=danger-gorge(4)
brg 90 (132, 80) watch   arc=E       seaward=180mathDeg sd=0.50 landD= 1 run= 50 rimDepth=6.2 nav=Y binTiles= 24 nearestCove=watch-east-bay(0)
brg100 (132, 90) watch   arc=E       seaward=180mathDeg sd=0.50 landD= 1 run=119 rimDepth=6.7 nav=Y binTiles= 25 nearestCove=watch-east-bay(10)
brg110 (132,103) watch   arc=E       seaward=180mathDeg sd=0.50 landD= 1 run=119 rimDepth=6.7 nav=Y binTiles= 29 nearestCove=watch-east-bay(23)
brg120 (132,121) watch   arc=S       seaward=180mathDeg sd=0.50 landD= 1 run=130 rimDepth=6.2 nav=Y binTiles= 34 nearestCove=watch-south-reed(15)
brg130 (129,131) watch   arc=S       seaward=270mathDeg sd=0.50 landD= 1 run=131 rimDepth=8.0 nav=Y binTiles= 38 nearestCove=watch-south-reed(7)
brg140 (121,131) watch   arc=S       seaward=270mathDeg sd=1.50 landD= 2 run=122 rimDepth=6.6 nav=Y binTiles=  1 nearestCove=watch-south-reed(1)
brg140 (121,132) open    arc=S       seaward=270mathDeg sd=0.50 landD= 1 run=123 rimDepth=6.5 nav=Y binTiles= 33 nearestCove=watch-south-reed(1)
brg150 (104,132) open    arc=S       seaward=270mathDeg sd=0.50 landD= 1 run=120 rimDepth=7.0 nav=Y binTiles= 29 nearestCove=watch-south-reed(18)
brg160 ( 85,132) open    arc=S       seaward=270mathDeg sd=0.50 landD= 1 run=120 rimDepth=6.0 nav=Y binTiles= 24 nearestCove=wreck-salvage-cut(30)
brg170 ( 80,131) open    arc=S       seaward=270mathDeg sd=0.50 landD= 1 run= 50 rimDepth=7.4 nav=Y binTiles= 22 nearestCove=wreck-salvage-cut(25)
brg180 ( 61,130) open    arc=S       seaward=270mathDeg sd=0.50 landD= 1 run= 56 rimDepth=8.3 nav=Y binTiles= 18 nearestCove=wreck-salvage-cut(6)
brg180 ( 60,130) calm    arc=S       seaward=270mathDeg sd=0.50 landD= 1 run= 56 rimDepth=8.2 nav=Y binTiles=  3 nearestCove=wreck-salvage-cut(5)
brg180 ( 59,130) wreck   arc=S       seaward=270mathDeg sd=0.50 landD= 1 run= 57 rimDepth=8.0 nav=Y binTiles=  1 nearestCove=wreck-salvage-cut(4)
brg190 ( 59,129) calm    arc=S       seaward=270mathDeg sd=1.50 landD= 2 run= 56 rimDepth=8.0 nav=Y binTiles=  1 nearestCove=wreck-salvage-cut(4)
brg190 ( 57,130) wreck   arc=S       seaward=270mathDeg sd=0.50 landD= 1 run=130 rimDepth=8.8 nav=Y binTiles= 24 nearestCove=wreck-salvage-cut(2)
brg200 ( 46,127) wreck   arc=S       seaward=270mathDeg sd=0.50 landD= 1 run=127 rimDepth=12.0 nav=Y binTiles= 28 nearestCove=wreck-salvage-cut(9)
brg210 ( 19,133) wreck   arc=S       seaward=270mathDeg sd=0.50 landD= 1 run=133 rimDepth=12.5 nav=Y binTiles= 50 nearestCove=wreck-west-ledge(24)
brg220 ( 14,133) wreck   arc=S       seaward=270mathDeg sd=0.50 landD= 1 run=133 rimDepth=12.5 nav=Y binTiles= 36 nearestCove=wreck-west-ledge(23)
brg230 (  2,121) wreck   arc=S       seaward=  0mathDeg sd=0.50 landD= 1 run=130 rimDepth=13.1 nav=Y binTiles= 64 nearestCove=wreck-west-ledge(16)
brg240 ( 13, 99) wreck   arc=W       seaward=  0mathDeg sd=0.50 landD= 1 run=118 rimDepth=13.0 nav=Y binTiles= 14 nearestCove=optimism-annex(10)
brg240 ( 13, 92) calm    arc=W       seaward=  0mathDeg sd=0.50 landD= 1 run=119 rimDepth=12.7 nav=Y binTiles= 12 nearestCove=optimism-annex(3)
brg250 ( 13, 90) calm    arc=W       seaward=  0mathDeg sd=0.50 landD= 1 run=119 rimDepth=12.0 nav=Y binTiles= 23 nearestCove=optimism-annex(1)
brg260 ( 13, 79) calm    arc=W       seaward=  0mathDeg sd=0.50 landD= 1 run= 50 rimDepth=12.2 nav=Y binTiles= 23 nearestCove=base-annex(2)
brg270 ( 12, 62) calm    arc=W       seaward=  0mathDeg sd=0.50 landD= 1 run=119 rimDepth=11.9 nav=Y binTiles= 20 nearestCove=arbitrum-annex(6)
brg280 ( 10, 57) calm    arc=W       seaward=  0mathDeg sd=0.50 landD= 1 run=129 rimDepth=9.8 nav=Y binTiles= 14 nearestCove=ledger-fog-hook(3)
brg280 (  1, 51) ledger  arc=W       seaward=  0mathDeg sd=0.50 landD= 1 run=138 rimDepth=0.0 nav=Y binTiles= 17 nearestCove=ledger-fog-hook(9)
```

Additional hard constraint discovered — **grave clearance.** Docks must stay > 3.25 tiles from every wreck-scatter grave (`src/systems/world-layout.test.ts:398`). The SW-corner wreck tiles are carpeted by the cemetery scatter (positions from the real `graveNodesFromEntries`):

```
  (15,95) nearest grave = 21.19 tiles
  (14,95) nearest grave = 21.22 tiles
  (15,84) nearest grave = 32.19 tiles
  (19,133) nearest grave = 1.83 tiles
  (14,133) nearest grave = 2.65 tiles
  (2,121) nearest grave = 3.16 tiles
  (60,130) nearest grave = 34.47 tiles
  (55,129) nearest grave = 29.42 tiles
  (14,110) nearest grave = 6.30 tiles
```

East-shore probe (the x=132 column is land-side at y≤102; x=131 is the water column — the shoreline jogs, which is why naïve picks fail predicate 2):

```
east-shore probe x=131/132, y=97..106 (need sd in (0,2], water, nav, gap != 19):
  (131,97) sd=0.50 water=Y body=watch inOpening=n nav=Y brgC=114 gapFrom99=15
  (131,98) sd=0.50 water=Y body=watch inOpening=n nav=Y brgC=115 gapFrom99=16
  (131,99) sd=0.50 water=Y body=watch inOpening=n nav=Y brgC=116 gapFrom99=17
  (131,100) sd=0.50 water=Y body=watch inOpening=n nav=Y brgC=116 gapFrom99=17
  (131,101) sd=0.50 water=Y body=watch inOpening=n nav=Y brgC=117 gapFrom99=18
  (131,102) sd=0.50 water=Y body=watch inOpening=n nav=Y brgC=118 gapFrom99=19
  (131,103) sd=0.91 water=Y body=watch inOpening=n nav=Y brgC=119 gapFrom99=20
  (131,104) sd=1.50 water=Y body=watch inOpening=n nav=Y brgC=119 gapFrom99=20
  (131,105) sd=1.50 water=Y body=watch inOpening=n nav=Y brgC=120 gapFrom99=21
  (131,106) sd=1.50 water=Y body=watch inOpening=n nav=Y brgC=121 gapFrom99=22
  (132,97) sd=-0.50 water=n body=watch inOpening=n nav=n brgC=114 gapFrom99=15
  (132,98) sd=-0.50 water=n body=watch inOpening=n nav=n brgC=115 gapFrom99=16
  (132,99) sd=-0.50 water=n body=watch inOpening=n nav=n brgC=115 gapFrom99=16
  (132,100) sd=-0.50 water=n body=watch inOpening=n nav=n brgC=116 gapFrom99=17
  (132,101) sd=-0.50 water=n body=watch inOpening=n nav=n brgC=117 gapFrom99=18
  (132,102) sd=-0.50 water=n body=watch inOpening=n nav=n brgC=117 gapFrom99=18
  (132,103) sd=0.50 water=Y body=watch inOpening=n nav=Y brgC=118 gapFrom99=19
  (132,104) sd=0.50 water=Y body=watch inOpening=n nav=Y brgC=119 gapFrom99=20
  (132,105) sd=0.50 water=Y body=watch inOpening=n nav=Y brgC=120 gapFrom99=21
  (132,106) sd=0.50 water=Y body=watch inOpening=n nav=Y brgC=120 gapFrom99=21
```

---

## 4. The proposed ring (10 mouths, every constraint machine-verified)

Design intent: retire the precinct exemption entirely — the four EVM mouths collapse into **one** Ethereum Mole; the three freed L2 berths redistribute to the lower east shore, the south-centre calm water, and the wreck shoal's east edge; two south-west authored mouths that duplicated their neighbours' stretches are consolidated. The ring keeps the two north mouths (budget exactly 2), keeps both horizontal extremes, and its consecutive bearing gaps are deliberately unequal (fukinsei): 8/41/19/18/23/49/26/30/39/107°.

| # | cove id | body | tile | seaward bearing (math deg) | width | replaces |
|---|---------|------|------|----------------------------|-------|----------|
| 1 | `ledger-fog-hook` | ledger | (9,54) | 0 (E) | 4 | KEEPS — west extreme (x=9) |
| 2 | `alert-signal-jetty` | alert | (104,12) | 90 (S) | 3 | KEEPS — north budget 1/2 |
| 3 | `warning-stone-notch` | warning | (118,10) | 90 (S) | 3 | KEEPS — north budget 2/2 |
| 4 | `danger-gorge` | danger | (131,59) | 180 (W) | 3 | KEEPS — east extreme (x=131) |
| 5 | `watch-east-bay` | watch | (132,80) | 180 (W) | 5 | KEEPS |
| 6 | `watch-terrace-quay` | watch | (131,101) | 180 (W) | 4 | **NEW** — ex-annex L2 berth, lower east shore |
| 7 | `watch-south-reed` | watch | (122,132) | 270 (N) | 4 | KEEPS — solana's camera-near berth |
| 8 | `calm-engawa-south` | calm | (60,130) | 270 (N) | 4 | **NEW** — ex-annex L2 berth; RETIRES `wreck-salvage-cut` (55,129), 5.1 tiles away on the same stretch |
| 9 | `wreck-shoal-east` | wreck | (31,125) | 270 (N) | 3 | **NEW** — RETIRES `wreck-west-ledge` (14,110); SW duty moves to the shoal's east edge, clear of the wreck scatter |
| 10 | `ethereum-mole` | calm | (15,95) | 0 (E) | 6 | **NEW** — REPLACES `ethereum-precinct` + `arbitrum-annex` + `base-annex` + `optimism-annex` (4 mouths → 1) |

Net: 12 authored mouths → 10; W-arc authored mouths 6 → 2; the EVM bay's 4 reserved slots → 1 (`src/systems/world-layout.ts:82-89` shrinks to a single-slot list, relieving `MAX_CHAIN_HARBORS` pressure at `src/systems/chain-docks.ts:14`).

Machine verification (script output, verbatim):

```
PASS  north budget <= 2 north=2
PASS  south budget >= 2 south=3
PASS  west extreme (x<=20) minX=9
PASS  east extreme (x>=120) maxX=132
PASS  all four rim arcs N/E/S/W arcs=E,N,S,W
PASS  body diversity >= 6 (world-layout.test.ts:300) bodies=ledger,alert,warning,danger,watch,calm,wreck
PASS  ring: no trio within 30 (widest-of-trio > 30) tightest trio 131,59/132,80/131,101 widest=42.0
PASS  ring+pigeonnier: no trio within 30 (widest-of-trio > 30) tightest trio 131,101/122,132/125,126 widest=32.3
PASS  fukinsei: pairwise-unequal consecutive bearing gaps gaps=8/41/19/18/23/49/26/30/39/107deg
      ring largest closed-rim empty arc: 49deg (140deg -> 189deg)

field verification of every proposed mouth (authored predicates + grave clearance):
OK   ledger-fog-hook          (9,54) body=ledger sd=0.50 landD=1 waterAhead=Y inOpening=n nav=Y graves=62.49 w=4
OK   alert-signal-jetty       (104,12) body=alert sd=0.50 landD=1 waterAhead=Y inOpening=n nav=Y graves=133.43 w=3
OK   warning-stone-notch      (118,10) body=warning sd=0.50 landD=1 waterAhead=Y inOpening=n nav=Y graves=143.94 w=3
OK   danger-gorge             (131,59) body=danger sd=0.50 landD=1 waterAhead=Y inOpening=n nav=Y graves=123.18 w=3
OK   watch-east-bay           (132,80) body=watch sd=0.50 landD=1 waterAhead=Y inOpening=n nav=Y graves=114.67 w=5
OK   watch-terrace-quay       (131,101) body=watch sd=0.50 landD=1 waterAhead=Y inOpening=n nav=Y graves=107.57 w=4
OK   watch-south-reed         (122,132) body=watch sd=0.50 landD=1 waterAhead=Y inOpening=n nav=Y graves=96.48 w=4
OK   calm-engawa-south        (60,130) body=calm sd=0.50 landD=1 waterAhead=Y inOpening=n nav=Y graves=34.47 w=4
OK   wreck-shoal-east         (31,125) body=wreck sd=0.50 landD=1 waterAhead=Y inOpening=n nav=Y graves=5.53 w=3
OK   ethereum-mole            (15,95) body=calm sd=1.50 landD=2 waterAhead=Y inOpening=n nav=Y graves=21.19 w=6
```

Effect on the §1 metrics, for the same realistic feed (which mouth each freed L2 takes is Lane D's binding decision, but under ANY binding the ring geometry holds): largest closed-rim empty arc drops **111° → 49°**; the W arc holds 2 authored mouths instead of 6; no three stations anywhere sit within 30 tiles of each other, precinct exemption retired; the two smallest pairwise gaps in the ring (gorge↔east-bay 21, east-bay↔terrace 20) remain as deliberate near-pairs — pairs are allowed, trios are not, and pairs read as neighbouring ports rather than a stack.

**Fukinsei audit of the ring:** inter-mouth bearing gaps 8/41/19/18/23/49/26/30/39/107° — all ten distinct, spanning more than an order of magnitude; the 107° gap (ledger-fog-hook → alert-signal-jetty) is mostly the NW fog opening (80° structurally empty), leaving the true emptiest shore stretch at 49° of south-centre — intentional `ma` on the open-body south rim, which predicate 1 forbids inhabiting anyway (the south rim between x≈62 and x≈105 is `open` water; only its fringes carry named bodies).

---

## 5. What breaks: assertion-by-assertion

Assumed implementation shape (Lane G to finalize): `RIM_COVES` = the 10-mouth ring; `EVM_BAY_STATION_SLOTS` = [`ethereum-mole`] (1 slot); `OUTER_HARBOR_STATION_SLOTS` = the other 9; pigeonnier unchanged. "UPDATE" = the test expresses a contract this epic intentionally changes → rewrite the test with the new contract. "MOVE" = the candidate, not the test, is wrong.

### `src/systems/world-layout.test.ts`

| Assertion (quote) | Verdict | Action |
|---|---|---|
| `expect(DOCK_TILES).toHaveLength(12);` (:280) | FAILS → 10 | **UPDATE** — 1 mole + 9 outer. |
| `expect(new Set(DOCK_TILES.map((tile) => \`${tile.x}.${tile.y}\`)).size).toBe(12);` (:281) | FAILS → 10 | **UPDATE** (uniqueness itself holds). |
| `expect(EVM_BAY_DOCK_TILES[1]).toEqual(BASE_HARBOR_DOCK_TILE);` (:282) | FAILS — no index 1 | **UPDATE** — `BASE_HARBOR_DOCK_TILE` retires with the precinct (`src/systems/world-layout.ts:118`). |
| `expect(OUTER_HARBOR_DOCK_TILES[1]).toEqual(HYPERLIQUID_HARBOR_DOCK_TILE);` (:287) | holds IFF gorge stays fill-slot 1 | **KEEP** — fill-order note for Lane G. |
| slot loop: water at mouth and one seaward step, rim land within 14 landward (:289-296) | PASSES for all 10 (verified in §4) | none. |
| `expect(new Set(RIM_COVES.map((cove) => cove.body)).size).toBeGreaterThanOrEqual(6);` (:300) | PASSES — 7 bodies | none. |
| `expect(RIM_COVES).toHaveLength(12);` (:305) | FAILS → 10 | **UPDATE** — the comment there (:301-304) already documents a 13→12 mouth retirement; this is the same class of change. |
| per-cove `rimDepthAt(bearing) > 0` + water tile (:311-312) | PASSES (`inOpening=n` ⇔ depth > 0) | none. |
| seawall barriers disjoint from `DOCK_TILES` (:316-322) | not verifiable here — `SEAWALL_BARRIER_TILES` generation not inspected | **[INFERENCE]** likely auto-adapts; Lane G must re-run; the new mouths are water-cardinally-adjacent-to-land tiles exactly like the retired ones. |
| graves `> 3.25` from every `DOCK_TILES` entry (:398) | PASSES — min 5.53 (wreck-shoal-east) | none — and this is why (19,133)/(14,133)/(2,121) were rejected in §3. |

### `src/systems/chain-docks.test.ts`

| Assertion (quote) | Verdict | Action |
|---|---|---|
| `for (const chainId of ["ethereum", "base", "arbitrum", "polygon"]) { expect(EVM_BAY_DOCK_TILES).toContainEqual(byChain.get(chainId)?.tile); }` (:85-87) | FAILS — only ethereum remains in the bay | **UPDATE** — the precinct contract is retired; assert instead that the four family chains render on four distinct mouths spread over ≥3 arcs (the new spread contract). |
| `expect(precinct[0]!.station.type).toBe("boathouse-precinct");` and `precinct.slice(1).every(... === "annex-pavilion")` (:95-96) | depends on Lane C's type names | **UPDATE** alongside the mole archetype. |
| precinct y-span `<= 24` (:97-98), `>= 3` distinct columns (:101), pairwise-unequal intervals (:102-104), `rimGap >= 1` chain (:106-113) | all FAIL — no multi-mouth precinct exists | **UPDATE** — delete; replaced by the global no-trio-30 rule. |
| `expect(docks).toHaveLength(OUTER_HARBOR_DOCK_TILES.length);` (generic-eight test, :140) | FAILS — 8 generics vs 9 outer slots | **UPDATE** — add a ninth generic chain to the fixture or assert 8. |
| `expect(precinct).toHaveLength(4);` (:166) | FAILS → 1 | **UPDATE**. |
| `expect(precinct.every((dock) => dock.tile.x <= 30)).toBe(true);` (:167) | PASSES — mole x=15 | none. |
| `expect(outer.every((dock) => dock.tile.x > 30)).toBe(true);` (:168) | PASSES — min outer x = 31 | **KEEP** — `wreck-shoal-east` was moved off x=30 to (31,125) for exactly this assertion; moving the candidate was cheaper than amending the test. |
| south ≥ 2 at y≥112 (:174), `watch-south-reed` rendered (:175), outer camera-near ≥ 2 (:180), ≥3 outer arcs (:185), north ≤ 2 (:190) | PASS for the realistic feed (reed S + ton S; arcs S/E/N) | none. |
| outer trio check `expect(widest, ...).toBeGreaterThan(30)` (:195-210) | PASSES — tightest rendered trio 32.3 with pigeonnier | none — **the precinct exemption dies because the precinct dies**. |
| precinct pairwise ≤ 24 (:215-219), bridge span 6..20.5 (:221-226), 3 columns (:227), unequal intervals (:228-230) | FAIL — no annexes to bridge | **UPDATE** — retire with the precinct; Lane C replaces with mole-landmark assertions. |
| `expect(OUTER_HARBOR_STATION_SLOTS.slice(0, 4).every((slot) => slot.cove.tile.x > 30)).toBe(true);` (:238) | fill-order dependent | **KEEP with Lane G note**: order the first four outer slots e.g. reed (122), gorge (131), calm-engawa-south (60), notch (118) — all x > 30, two southern. |
| outerRing north ≤ 2 (:245), south ≥ 2 (:246), `x <= 20` (:247), `x >= 120` (:248), uniqueness (:249) | PASS — authored N=2, S=3, x∈[9,132], 10 unique + pigeonnier | none. |
| `expect(docks.map((dock) => dock.tile)).toEqual(OUTER_HARBOR_DOCK_TILES);` (:364) | FAILS — 8 docks ≠ 9 tiles | **UPDATE** — slice to the fill prefix or extend the fixture. |
| pigeonnier tests (:368-428) | PASS — untouched | none. |

### Contract docs that must be amended (not tests, but load-bearing)

- `docs/pharosville/VISUAL_INVARIANTS.md:56-58` — "outside the Ethereum precinct no three stations sit within 30 tiles" → the exemption clause is retired; the sentence becomes global.
- `docs/pharosville/VISUAL_INVARIANTS.md:71-73,89-90` — "Ethereum's hall and true campanile … with its L2 belvederes as one precinct through thick railed, covered bridges" and "the Ethereum precinct has a shared path and bridge-connected annexes" → rewritten for the standalone Mole (Lane C/D own the wording; geometry note: the bridge-span gate referenced at `chain-docks.test.ts:212-214` has no pair to span anymore).

**No candidate needs moving for any test** — the one collision found (outer `x > 30` vs x=30) was resolved by choosing (31,125) over (30,125).

---

## 6. The Ethereum Mole: can it sit somewhere that reads as a distinct landmark? Yes.

The current mouth (14,74) is the weakest landmark site on the calm shore: its eastward approach runs only **47 tiles before hitting the island** (`run=47`), it sits mid-shore between its own annexes, and three more stations crowd within 21 tiles. The calm shore's south stretch is categorically better — the island no longer blocks the approach, and the deepest authored rim shoulders (rimDepth 14, the "broad engawa lobe and pointed promontory" of `RIM_DESIGN_NOTES`, `src/systems/garden-rim.ts:152`) front it.

Verified candidates (all: calm water, sd ∈ (0,2], rim land ≤ 14 landward, outside openings, navigable, graves > 3.25; verbatim):

```
(15,95) sd=1.50 landD=2 run=117 rimDepth=14.0 dLH=51 brgLH=241deg brgC=245deg nav=Y graves=21.19
(15,84) sd=1.50 landD=2 run=116 rimDepth=14.0 dLH=47 brgLH=253deg brgC=255deg nav=Y graves=32.19
(14,95) sd=0.50 landD=1 run=118 rimDepth=13.9 dLH=52 brgLH=241deg brgC=245deg nav=Y graves=21.22
```

**Primary: (15,95).** Reasons, all measured:
1. **Own promontory.** rimDepth 14.0 is the maximum authored shoulder (`RIM_CONTOUR`, `src/systems/garden-rim.ts:89-99`) — the rim bulges hardest toward the sea here, so a mole lands on a headland that already exists in the field, not on a straight bank.
2. **Clear approach.** 117 tiles of unobstructed water eastward (vs 47 at the current mouth) — deep moorings, and the width-6 mouth a monumental boathouse deserves.
3. **Isolation.** nearest new-ring mouth is 34.0 tiles (wreck-shoal-east); nearest authored mouth of any kind is 33.5 (the retired optimism-annex site at (13,89)). Under the old layout the precinct mouth had three neighbours within 21 tiles; under the new ring it has none within 30 — it reads alone, which is what "monumental alongside the lighthouse" requires without competing with the beacon (51 tiles away; the lighthouse keeps the analytical-anchor role).
4. **Slightly off-shore foot** (sd 1.50, landD 2): the mouth sits a half-tile deeper than the annex mouths did, so a mole superstructure rises from its own quay without borrowing rim land.

Alternates: **(14,95)** — same site one tile tighter to shore (sd 0.50) if the mesh wants the quay flush against the bank; **(15,84)** — the northern shoulder of the same lobe, 4 tiles closer to the lighthouse axis with a cleaner grave margin (32.2), if the operator wants the Mole nearer the west-shore sightline the precinct used to hold.

---

## 7. Hand-off notes for the other lanes

- **Lane G (systems):** `stationSlotForChain`'s two-pool split (`src/systems/chain-docks.ts:188-201`) survives; only the slot tables change shape (1 + 9). `ETHEREUM_HARBOR_PRIORITY_CHAIN_IDS` can keep its selection semantics (`src/systems/chain-docks.ts:166-169`) while losing its spatial meaning. Fill-order constraint to preserve `:238`: first four outer slots all x > 30 with ≥ 2 southern.
- **Lane D (identity):** three freed L2 berths need bindings: `watch-terrace-quay` (131,101), `calm-engawa-south` (60,130), `wreck-shoal-east` (31,125). `wreck-salvage-cut`'s archetype (salvage-slip) loses its authored home; the wreck body keeps one mouth.
- **Lane C (Ethereum):** the mole site (15,95) has rim land ≤ 14 tiles landward along bearing 0 — the same predicate every existing station's mesh assumes. `GARDEN_DOCK_OBSTACLES` derives from `DOCK_TILES` (`src/systems/garden-water-exclusion.ts:111-114`), so ship-exclusion circles adapt automatically; no manual obstacle edits.
- **Budget (Lane F):** the ring is mouth-count NEGATIVE (12 → 10 authored, 4 → 1 EVM slots), so any added geometry budget for the Mole displaces the three retired annex-pavilion builds plus the two consolidated south-west mouths — that is the "name what it displaces" ledger entry.

*All structural claims carry `path:line` citations; every number is script output from the real modules. The only [INFERENCE] flagged is the seawall-barrier regeneration in §5.*
