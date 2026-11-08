# Simulation preparation comparison

No browser, network, or git-state mutation is needed. The benchmark uses fixed UTC, the existing fleet generator extended to 657 boats, the real harbour layout/coast, and the committed exact warmup seeds. It reports a market snapshot separately when one is supplied; the generated fleet is not a recording of integration's market data.

Extract the immutable baseline's sim sources inside this worktree (read-only Git operation):

```bash
mkdir -p .cache/sim-prep-5dbb6a2a
git archive 5dbb6a2a src/harbour/sim src/harbour/model/classify.ts | tar -x -C .cache/sim-prep-5dbb6a2a
HARBOUR_PREP_BENCH=1 npx vitest run src/harbour/sim/preparation-bench.test.ts --maxWorkers=1 --reporter=dot
```

`HARBOUR_PREP_BASELINE` can name another local extraction of the same baseline. `HARBOUR_PREP_SNAPSHOT` accepts the existing golden-capture JSON format (`epoch`, `responses[path].body`) and requires exactly 657 boats. The benchmark rebases source ages to the fixed fixture clock, preserving the supplied coin/chain readings.

Both arms receive identical model/layout/coast/seed data. One untimed warmup precedes four measured preparations per arm in alternating order. Each sample constructs a fresh layout and seeds its caches: this tests cold worker ownership, not a cache warmed by previous revisions. The measured region includes layout construction, seed installation, allocation and the current/soon route preparation done by `warm-legs.worker.ts`; it excludes HTTP, image decode, worker startup/IPC and rendering. The allocation-only numbers exclude layout/seed installation. A required ordinary-route failure also fails the comparison, so a fast empty/failed fleet cannot pass. The new median must be at most 1.15 times the old median. Results are written to `preparation.json` here.

The full-cycle diagnostic remains explicit:

```bash
HARBOUR_AUDIT_HOURS=6 npx vitest run src/harbour/sim/dwell.test.ts --maxWorkers=1 --reporter=dot
```

S16-I3's strict one-point target is deliberately deferred. `HARBOUR_D10_STRICT=1 npx vitest run src/harbour/sim/sim.test.ts --testNamePattern empirically --maxWorkers=1` runs the retained strict target and is expected to fail until retiming can meet the cold-preparation budget. The normal suite still checks proportional planned windows, speed limits, clearance, deterministic playback, worker parity, recovery and voyage continuity.
