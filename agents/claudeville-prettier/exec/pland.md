# Lane PLAND (polish: REVIEW #7, #4, #9, #10) — exec notes

## Changelog bullets (user-facing)
- Storm signals at the masthead are now true storm-signal black and stay readable from the default view: a crisp cone, drum or cone over drum, never smaller than a few pixels.
- A ship dressed overall carries a denser, brighter line of flags; harbour offices under works show a taller scaffold in fresh timber.
- The west lobe's olive terraces are low dry-stone lines along the contour, broken by the trees.
- The hill sanctuary stands apart on its own knoll, in a dense ring of dark cypresses, with a path from the west road.
- Summer fireflies are easier to spot up close (still a few faint specks).

## Legend lines
None new (cues, thresholds and hover facts unchanged).

## Notes
- Sanctuary moved ~34 m (not 15–25 m up the spine): along the spine its ring would sit on Wreck Cove's wreck slots; it now
  stands east of the west road at screen-plan (-155, -15).
- `hb_export.py`: AO bake falls back to the CPU when the GPU bake fails or returns all black (it silently baked
  black AO here: everything x0.2).
- Rebuild needs `outputs/harbour/{island/occupancy.json, wrecks/raw, data}` (copied from the island lane's outputs).
- Fireflies: raised globally within their garden/hillside band (the shader has no hedge/sanctuary mask).
