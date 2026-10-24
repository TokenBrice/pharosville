# Arrival and UI loading boundaries

`src/main.tsx` is the React-free admission owner. It applies the shared sorted
720×600 physical-screen **and** viewport predicates before activating any world
preload or importing `react-entry.tsx`. `index.html` keeps the first-paint arrival
and an inert template with the same useful welcome, illustration, guide and links
as the React fallback. Window resize and screen orientation changes can admit or
unmount the app; stale imports cannot mount an app after admission is withdrawn.

Vite emits inert `data-pv-preload="modulepreload"` / `data-pv-preload="preload"`
links. They retain the admitted desktop's React/world/asset discovery lead, while
avoiding viewport-media-only leaks on small physical screens or under zoom. Static
byte-ledger tools should interpret `data-pv-preload` as the intended `rel`.

`poster.ts` preserves the original first-paint illustration and restores it for
every admission. It cancels old transition callbacks before resetting a poster;
`HarbourApp` also resets arrival presentation when a new world mounts.

Reveal is driven by `Engine.onRendered`, not a fixed number of animation-frame
callbacks or global stats from another mount. Successful data reveals only after
the committed model's prepared revision and full boat count match a completed
composer frame. The engine copies `fleet-frame`, published by FleetSystem only
after posing/submitting the installed revision, rather than copying desired
`readiness` counts. A valid zero-boat revision is ready too; its arrival copy
explicitly says there are no boats in the current readings. A failed first
stablecoins attempt reveals the completed boatless base scene without claiming
that readings are live.

If the planning worker fails before its first install, `simulation-status` marks
the real awaiting model unavailable. Its next completed boatless frame reveals
the world with “Harbour ready; live readings unavailable.” Allocation and initial
route generation are synchronous; putting them in a timeout alone would still
risk a visible frame stall, so this path deliberately does not run a main-thread
planner (inside or outside rAF). A later stablecoins refresh restarts startup
preparation off-frame; only a successful coherent install clears the unavailable
status. Optional endpoint arrivals do not repeatedly restart a broken worker.
Worker loss after an install instead holds the installed payloads with honest
aging, without replacing the fleet or planning on the frame.

**NFS-055 approved trial:** if stablecoins remains pending, the poster holds for
2000 ms from this mount's first completed-render callback (not navigation, engine
construction or init completion). The first boatless completed frame at/after that
deadline starts the usual crossfade, with “Waiting for the fleet’s readings.”
Pending data does not introduce fog, fake readings or placeholder boats. The real
awaiting model stays installed until DataSystem atomically commits a prepared
model/pose; the next fleet update draws the complete fleet in one step. Successful
data that has arrived but is still preparing cannot bypass readiness via this
pending-only deadline. A later success/failure updates arrival copy if it is still
mounted, without restarting the fade. The existing UI's unavailable-data state
remains the truth surface once the arrival shell is gone.

Poster fade remains **1100 ms** (the existing reduced-motion CSS remains in force);
its removal fallback stays 1300 ms, and the shell unmount stays 1200 ms after
crossfade start. Detail preloading begins immediately at reveal, while analytics
still waits for the shell timer. Early interactions render a small, non-empty
loading surface using the same fixed-position ledger/panel/search chrome and
working close controls until the detail module arrives.
The denied welcome enables analytics only after a paint opportunity. There is no
app-owned Cloudflare beacon injector; CDN-injected scripts are outside this runtime's
ownership.

**NFS-036 approved trial:** `systems.ts` registers lightweight life/identity wrappers
under the original names and in the original positions. Dynamic imports begin only
when Engine calls their already-deferred init slots after the first frame; identity
still follows completed life init. The wrappers forward lifecycle calls and propagate
import/init errors to Engine's existing handler. `?defer=0` still initializes these
same slots during boot. People, gulls and sea labels can therefore appear later
while their chunks load; these changes require arrival-filmstrip/operator acceptance,
not merely matching settled scenery.

Deferred life/identity preparation retries transient material-disposal aborts up
to three times per added root. Continued supersession warns and retains the
current scenery rather than disposing it; genuine initialization/preparation
errors are logged and dispose the failed system. The additions' original
visibility is restored in `finally`, including teardown and failure paths.

The detail boundary installs complete cemetery prose and the prelaunch book
before mounting panels, search or ledger. Hover, picking and world-model work keep
exact eager projections. `scripts/vite/static-data-plugin.ts` derives these from
the canonical synced JSON for both Vite and Vitest, using the same cemetery
classifier as full records; no duplicate hand-maintained data can drift. The
snapshot milestone-source merge remains in `installYardBook`.

Overlay projections use one analytic camera context per UI frame. Canvas rects
are invalidated by resize/scroll observers, label/tag sizes by ResizeObserver and
content changes. The store runs every projection/read callback before every style
write callback; unchanged style strings are not reassigned. Teardown disconnects
observers and clears frame subscriptions.

Targeted regression coverage: `admission.test.ts`, `reveal.test.ts`,
`poster.test.ts`, `lazy-systems.test.ts`, `ui/measurements.test.ts`, `ui/yard.test.ts`,
`model/obituary.test.ts`, plus the existing `client.test.tsx` and
`scripts/check-viewport-gate.mjs`. Real-browser integration must additionally
exercise zoom, interrupted/failed/slow imports, font completion,
crossfade/readmission, pending→success/error/empty data and first-action
keyboard/focus behavior. Show matched normal/reduced-motion arrival filmstrips,
including wakes, rigging, labels and late life/identity scenery. Unit tests do not
establish GPU timing, temporal equivalence or operator approval of the two trials.
