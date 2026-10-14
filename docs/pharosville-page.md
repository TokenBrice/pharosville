# PharosVille Route Contract

Last updated: 2026-10-14

PharosVille is a living stablecoin harbour at
`https://pharosville.pharos.watch/`. Every stablecoin is a boat in a lighthouse
harbour town, sailing between chain harbours in proportion to its supply. The
world carries the meaning; exact readings appear only on demand, in the hover
tag, the side panel and the ledger.

## Entry and trust boundary

- The browser uses same-origin `/api/*` endpoints only; the Pages Function
  holds `PHAROS_API_KEY` and proxies the allowlisted reads.
- The world loads only after both the physical screen and current viewport
  independently satisfy the 720×600 size profile (long side × short side),
  which admits desktops, laptops, unfolded foldables and tablets. Dimensions are sorted, so these remain direct size tests,
  not an orientation or aspect-ratio gate. Blocked viewports render DOM guidance
  without fetching world data or importing three.js and its media.
- First paint is a poster of the harbour (an illustration, no live numbers)
  that crossfades into the first live frame. The production renderer is
  three.js/WebGL2; if it cannot start, the poster stays up with the guide and
  Pharos links. There is no graphical fallback renderer.

## What the world means

| World element | Meaning | It must not imply |
| --- | --- | --- |
| Boat | one active stablecoin; hull family by peg currency, size by supply class | issuer activity or operations |
| Circuit | the boat docks at each chain's pier for a share of its time equal to its supply share there | a real transfer or bridge volume |
| Pier | a chain harbour, sized by the supply it holds | chain health from one cue |
| Lighthouse beam | the Pharos Stability Index score and band | total market health from one cue |
| Sea state | the off-peg share of supply | confirmed stress from stale evidence |
| Weather | DEWS stress signals | a forecast |
| Fog | stale or missing data | calm |

## Interaction and motion

- The resting frame is the world plus one corner wordmark with a live dot (D11).
  Hover shows a tag; click opens the side panel; `L` the ledger, `/` search,
  `C` chart labels; Escape closes the top layer.
- Pan and zoom stay inside the harbour; the sim is deterministic in wall-clock
  time, so a reload never teleports the fleet.

## Media

Runtime media is same-origin: stablecoin and chain logos, and the checked
files under `public/harbour/` (island and lighthouse GLBs, the boat kit, the sea
mask, the emblem atlas, the poster).

## Non-goals

- mobile or portrait world rendering
- client-side upstream API calls or credentials
- wallet, trading, custody, accounts, or financial advice
- inferred transfer, bridge-volume, or issuer-operation semantics
- a second renderer or invented fallback market data
