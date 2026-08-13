# W3.2 motion audit

Scope: current ambient oscillators and transition clocks relevant to “one
wind, one breath.” This records the pre-edit audit requested by W3.2; it does
not change the approved plan.

| System | Previous driver / rate | W3.2 route |
| --- | --- | --- |
| Wind direction | Weather clock, 241/97/41 s layers | Kept as the single world-space vector |
| Sustained breeze | Weather clock, 83 s | Kept inside the one weather plan |
| Gust | 7.3 s wave with 2.9 s wobble | Replaced by one 24 s front (2 s attack, 6 s release), position-delayed downwind |
| Storm swell | Weather clock, 167 s | Kept as semantic weather, not an object oscillator |
| Sails and fleet pennants | Weather clock, up to ~0.94 Hz flutter | One wind + delayed gust + breath; slowed to at most ~0.45 Hz |
| Chain flags | Baked static wave | One wind + delayed gust + breath; reduced motion restores the authored static bearing |
| Mist drift / opacity | World clock + wind / static opacity | One wind; opacity receives shared breath at +0.1 cycle, ±5% |
| Lantern emissive | Day-cycle phase only | Shared breath at +0.2 cycle, ±8% |
| Ship and buoy bob | Sea-state sines, ~0.01–0.16 Hz | Physical sea phase retained; amplitude receives shared breath at +0.3 cycle |
| Gull soaring | Sortie choreography + weather drift | Existing W3.4 sorties retained; direction remains the one wind |
| Water normal scroll | World clock along moon bearing | Re-routed to the one wind; speed receives shared breath at +0.5 cycle |
| Wakes | Ship velocity / persistent-field decay | Semantic ship driver retained; strength receives shared breath at +0.6 cycle |
| Loading beacon | Independent 2.4 s CSS loop | Re-routed to the named 9 s 40/60 breath token |
| Fireflies | 7–37 s seeded drift/pulse | Already below 0.5 Hz; shared wind remains its only advection vector |
| Selection cue | ~0.33 Hz | Kept: direct interaction feedback, not ambient weather |
| Beacon flame | 0.18/0.59 Hz CPU flicker plus advected shader detail | Fastest CPU layer slowed to ~0.48 Hz; flame advection is not a scene-attention oscillator |
| Bird wingbeats | Sortie-local | Explicit fast exception |
| Water ripples / foam detail | Multiple physical wave terms | Explicit fast exception |

Reduced motion continues to supply the canonical time-zero frame. No module in
this change adds a timer, `performance.now()`, wall-clock read, or animation
frame source.
