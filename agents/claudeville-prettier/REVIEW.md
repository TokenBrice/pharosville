# Prettier sweep — art-direction review (fresh eyes)

Reviewer: read-only art director, 2026-10-24. Build `feat/prettier` (:5173) vs v1.2.1 (:5199).
All frames: `scripts/harbour/shot.mjs`, 1600×1000, real GPU. Captures in `outputs/review/`
(`base-*.png` / `new-*.png`, side-by-side `pair-*.jpg`, crops `crop-*`). 50 captures, including one 5-frame burst.
Date context: Oct 24, nominal lat 35°, so sunset is about 18.43 and golden hour about 17.1.

## 1. Verdict

**Yes, it is clearly prettier, and calmer, than v1.2.1, though not uniformly.** It is more magical at dusk and night,
and it reads less like a dashboard at noon.

Strongest:
- **Fleet clutter is down sharply.** Distant sails are smaller, aerially tinted and less saturated, and the big
  flat-colour sail squares that peppered v1.2.1's Roads and harbour (`pair-noon.jpg`, `pair-morning.jpg`) are gone.
  The Pharos and the civic quarter now carry the frame. This is the single biggest win.
- **Night value hierarchy.** Sails dim at night, so lamps, the fire and the beam are the lights
  (`pair-night.jpg`, `pair-pharos.jpg`). The moonlit sea and lamp reflections in the inner basin are lovely.
- **17.9–18.6 h.** Coral and violet sky, warm walls against cool shade, and the harbour lamps coming on.
  This is the postcard hour (`pair-lw2.jpg`, `pair-lampwave.jpg`).
- **Golden hour.** It has long light, a cool shaded sea, warm sunlit water and glowing sails (`new-golden.png`).
  Tilt-shift is restrained.
- **Storm and front skies.** Sculpted slate decks, and a WARNING front that reads as weather coming in from one
  side. It is legible without urgency (`pair-danger.jpg`, `new-front.png`).

Got worse:
- **Sun shadows on the sea** are hard, dark slabs (sails, masts, the Pharos) that dirty the water by day (issue 1).
- **The heliograph** can read as a milky fog patch, which is a false data cue (issue 2).
- **Night cloud banks** are bigger and brighter, and now compete with the Pharos (issue 3).
- **Dawn** lost its warmth and reads lavender-grey and muddy (issue 6).
- **The water** is generally a heavier, duller blue by day (issue 11).

## 2. Ranked issues

| # | What I see | Capture | Likely owner | Suggested fix | Sev |
|---|---|---|---|---|---|
| 1 | Sun shadows on water are near-opaque, hard-edged dark parallelograms: sail and mast shadows in the Roads and berths, and the Pharos's 85 m shadow as a big straight-edged wedge across the harbour mouth at 9 h and at dawn. They look like texture errors and darken the harbour's centre of attention. | `crop-roads-shadow.png`, `crop-berth-glint.png`, `pair-morning.jpg`, `pair-dawn.jpg` | GOLDEN: `ocean-material.ts` (`sunSh` on body / `hbSeaGolden`), `world/sun-shadow.ts` | On water, let the shadow remove only sun glint and golden warmth. Cap body darkening at about 10–15 %, widen the PCF with distance from the caster, and fade thin casters (sails, rigging) on the sea entirely. | should (high) |
| 2 | The daylight heliograph "coin" renders as a soft milky-white smear on the harbour. In winter and pale light it reads as a fog or haze patch, and fog means stale data. At t=11 the same area becomes an intense glitter hot-spot. | `crop-winter-blob.jpg`, `pair-winter.jpg`, `pair-berth.jpg` | PHAROS: `uBeamSun` in `ocean-material.ts` | Make it specular-only: modulate glint density and brightness and never add diffuse white. Keep it small and gate it on real sun glint. It must never lift the water's albedo toward grey-white. | should (data-mislead) |
| 3 | Night and 3 am cloud banks are larger, double-tiered and lit bright blue-white with strong rims. They are the brightest mass in the top third after the fire and pull the eye from the Pharos. The beam paints across them. | `pair-night.jpg`, `crop-3am-beam.jpg`, `pair-psinone.jpg` | SKY: seasonal autumn banks / night cloud lighting (`sky/sky-system.ts`) | Cut night cloud albedo about 40 % and keep a moonlit rim only on the moon side. Shrink the autumn "long low banks" in calm weather, since the amount of cloud must stay DEWS. | should |
| 4 | West-lobe terrace walls read as rows of dark grey slabs at heart: gravestones or solar-panel rows. They are busy, and morbid next to Wreck Cove. | `crop-sanct-terr.jpg` (right), `pair-noon.jpg`, `pair-dawn.jpg` | ISLAND: `terrain.py` terrace risers, `hb_dress.py` TERRACE walls | Lower wall height and contrast, and use warm dry-stone near the ground value. Break each run with olives, or let the walls follow the contour as low lines rather than upright blades. | should |
| 5 | The beam shaft is still blotchy: periodic light and dark segments along its far half. It is now composited over the cloud banks with no depth fade. | `crop-3am-beam.jpg`, `strip-beam.jpg` | PHAROS: beam shaft shader | Replace periodic density with low-frequency noise plus blue-noise dither, and fade the shaft where it crosses sky clouds. | should |
| 6 | Dawn (6.8) lost v1.2.1's pink warmth and reads as a lavender-grey wash. Together with the Pharos shadow wedge and the dark terraces, the harbour looks muddy. | `pair-dawn.jpg` | GOLDEN / FRAME: grade at low sun (`world/sun.ts`, post) | Mirror the golden-hour warm/cool split at dawn: warm the sunlit side and lift sky saturation slightly. | should |
| 7 | New data cues are illegible at default views. Storm signals are invisible at heart; at close range the WARNING drum is a brown cask on the masthead that reads as cargo, not a signal. Launch bunting and office works were not discernible in heart or overview frames. | `new-storm.png`, `crop-cueclose.png`, `new-launch.png`, `new-office.png` | SIGNALS: `fleet/signals.ts`, office works dressing | Use real storm-signal convention (black, matte, a crisp silhouette) and a minimum screen size of about 6–8 px at heart. Make bunting brighter and denser. Put office scaffolding on the camera-facing side. Keep them calm: no glow. | should |
| 8 | The lamp wave is barely perceptible. At 17.9 lamps are partly lit and at 18.15 they are almost all lit, but no front or "wave" shape is readable in any still. | `pair-lw2.jpg`, `pair-lw.jpg` | PHAROS: `lights/lamp-wave.ts` (`LAMP_WAVE_SPREAD` 0.2, `JITTER`) | Shorten each lamp's own ramp, keep or widen the total spread, and drop jitter so lit and unlit are distinct along the moles. | nice |
| 9 | The sanctuary tholos sits hard against the shipyard's retaining wall. Its cypress ring is not legible, so it reads as a park gazebo beside a shed. | `crop-sanct-terr.jpg` (left), `new-west.png` | ISLAND: `SANCTUARY_UV` in `terrain.py`, `SANCT_CYPRESS` in `hb_dress.py` | Move it 15–25 m up the spine, away from the yard, and thicken and darken the cypress ring so it is a distinct sacred place. | nice |
| 10 | Fireflies are invisible at a 160 m close-up on a summer night. | `trio-sanct.jpg` (right) | LIFE: fireflies | Raise size and brightness about 2× near hedges and the sanctuary, with no bloom. Or accept them as an easter egg for deep zoom. | nice |
| 11 | Daytime water is a heavier, darker and duller blue than v1.2.1's luminous turquoise (noon, morning, overview), so the harbour feels weightier. | `pair-noon.jpg`, `pair-morning.jpg`, `pair-ov-noon.jpg` | FRAME / GOLDEN: ocean body colour and aerial tint | Return part of the shallow-water lift in the inner basin, about +8–10 % value near the quays. | nice |
| 12 | Cloud-shadow mottling on the harbour during a front is hard-edged camouflage. | `new-front.png` | SKY: `hbCloudShadow` on ocean | Soften the shadow edge on water, as in issue 1. | nice |
| 13 | Map label "THE" sits on top of "ROADS" and collides with its letters in several new frames. | `pair-lw2.jpg`, `pair-dusk.jpg` | labels / ui | Check whether the offset changed; keep "THE" clearly above the word. | nice |
| 14 | Hover lights switch on and off with no fade (per INTEGRATION-NOTES; not testable in stills). | — | CAMERA: hover light | Add a 150–250 ms ease in and out. | nice |
| 15 | Night overview (pre-existing): lamp halos form strings of pearls, and bloom grows them in summer. | `pair-ov-night.jpg`, `new-meteors.png` | lights / bloom | Reduce halo size at overview distance. | nice |

Nothing reads as neon or crypto-spectacle. The beam stays warm, cues have no glow, and storms are grey rather than red.

## 3. Open-question checklist

| Question | Result |
|---|---|
| Lamp wave visible at dusk? | **Barely.** 17.9 shows a partial lighting state, but no readable wave in stills; everything is lit by 18.3 (#8). |
| Fireflies too faint? | **Yes.** Invisible at a 160 m close-up, summer, 22.5 h (#10). |
| Terrace walls busy dashes at heart? | **Yes.** Upright grey slabs, the most distracting new land element (#4). |
| Sanctuary hard against the shipyard? | **Yes.** It touches the yard wall (#9). |
| Beam shaft still blotchy? | **Yes.** Less than v1.2.1, but banding remains on the far half (#5). |
| Golden-hour tilt-shift blurring the harbour too much? | **No.** Only the far foreground corners soften; the harbour and Pharos stay sharp (`new-golden.png`). |
| Beam reflection column too bright when facing the camera? | **Not observed.** A 5-frame burst never caught the beam aimed at the camera, and the frames I have show no harsh column. Re-check with a frame aimed at the camera. |
| Hover lights pop on and off? | **Unverified in stills.** The notes confirm there is no fade (#14). |
| Storm cones legible but calm? | **Calm, yes; legible, no.** Invisible at heart, and a cask-like drum up close (#7). |

Other checks:
- **stale=1:** the fog is unchanged from v1.2.1 and correct.
- **psi=none:** the banked fire reads as dark, which is correct. The embers and keeper's lamp are too small to see at heart, which is acceptable.
- **dews=DANGER:** good.
- **winter:** good, apart from #2.
- **moment=depeg reef flare:** not seen in a still, so timing needs an anchored burst.
- **meteors:** none caught.
