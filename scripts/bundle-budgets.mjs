export const bundleBudgets = {
  entry: {
    label: "entry chunk",
    pattern: /^index-[A-Za-z0-9_-]+\.js$/,
    // 2026-10-14 Harbour cutover: the shell is now only the gate, the arrival
    // card and the error reporter — measured 10.4 KiB raw / 3.9 KiB gzip.
    // Tightened 2026-10-19 (need-for-speed v1.3.0): the gate now runs before React is
    // imported; measured 6.0 KiB raw / 2.6 KiB gzip. Cap leaves room for the gate only.
    maxRawBytes: 10 * 1024,
    maxGzipBytes: 4 * 1024,
    required: true,
  },
  desktop: {
    label: "Harbour lazy chunk",
    pattern: /^harbour-app-[A-Za-z0-9_-]+\.js$/,
    // 2026-10-14 Harbour cutover (agents/2026-10-13-pharosville-reboot P5 prep):
    // Engine, the ten world systems, data feed + model + sim, the chart UI and
    // the brand-colour/logo/dead-coin tables, loaded only past the viewport
    // gate. Measured 520.5 KiB raw / 172.5 KiB gzip while the P3/P4 polish
    // passes were still landing; the cap is measured + ~23% for that work, not
    // a licence to grow past it without a measured re-baseline.
    // Re-baselined 2026-10-14 after the operator's P6-P8 rounds (civic quarter,
    // chain identity and chart lettering, procedural audio, Titan ships, Wreck
    // Cove v2, the 43-coin pre-launch book): measured 1,319.7 KiB raw /
    // 400.4 KiB gzip. Cap = measured + ~14%.
    // Tightened 2026-10-15 after the need-for-speed pass moved the registry,
    // zod and the pre-launch book out of the chunk: measured 904.3 KiB raw /
    // 312.9 KiB gzip. Cap = measured + ~12%.
    // Tightened 2026-10-19 (need-for-speed v1.3.0): detail panels, cemetery prose, life/identity
    // and the planner moved to lazy chunks/worker: measured 756.8 KiB raw / 255.2 KiB gzip.
    // Re-baselined 2026-10-25 for Living Harbour v1.4.0 (agents/claudeville-prettier) merged onto
    // Fair Wind's lazy split: beam light, lamp wave, gust field, fronts, moon and meteors, events +
    // Day book, signals, moments, camera glides, postcard. Measured 896.7 KiB raw / 305.6 KiB gzip.
    // Cap = measured + ~10%.
    // Re-baselined 2026-11-09 for Clear Air v1.6.0 (agents/pharosville-ultimate): Pilot's Chart tokens and the night
    // bridge palette, slips, dated charts with values tables, the help and controls sheet with lucide icons, the
    // five-stop guide, Watch controls, ledger panes and filters, measured framing, the gesture/zoom/picking rework,
    // typed services and checked shader patches. Measured 994.4 KiB raw / 337.5 KiB gzip. Cap = measured + ~10%.
    // Re-baselined 2026-11-09 for Golden Hour v1.8.0 (since 00f9a9bc): coin-panel readings (i-panel),
    // harbour report/digest (d-report), subject links (d-links), postcard receipt (a-postcard), sky extras
    // (e-sky), harbour mirror (e-mirror), decorative score (e-score), live welcome HTML/OG card (u-welcome).
    // After the compact active-id fix: 1,225,517 B raw / 409,031 B gzip (hash-only gzip change).
    // Cap = measured + 10%, rounded up to whole bytes.
    maxRawBytes: 1_348_069,
    maxGzipBytes: 449_935,
    required: true,
  },
  detailPanels: {
    label: "Detail panels lazy chunk",
    pattern: /^DetailPanels-[A-Za-z0-9_-]+\.js$/,
    // 2026-11-09 v1.8.0: client active IDs now come from a generated ID-only registry cut.
    // Removing full coin metadata reduced 607,352 B raw / 157,807 B gzip to 159,215 / 49,488 B.
    // Cap = measured + 10%, rounded up; guards against metadata returning to the panel path.
    maxRawBytes: 175_137,
    maxGzipBytes: 54_437,
    required: true,
  },
  renderer: {
    label: "Three.js renderer chunk",
    pattern: /^vendor-rendering-[A-Za-z0-9_-]+\.js$/,
    // 2026-10-14 Harbour cutover: three r186 + postprocessing (bloom, AgX
    // tone mapping, SMAA). Measured 837.3 KiB raw / 241.2 KiB gzip; the
    // Garden-era 1,600/454 cap is retired. Cap = measured + ~14%.
    maxRawBytes: 960 * 1024,
    maxGzipBytes: 276 * 1024,
    required: true,
  },
  css: {
    label: "Harbour CSS",
    pattern: /^harbour-app-[A-Za-z0-9_-]+\.css$/,
    // 2026-10-14 Harbour cutover: the chart-paper UI (D12), loaded with the
    // lazy chunk. First-paint CSS is the static public/arrival-shell.css.
    // Measured 18.3 KiB raw / 4.8 KiB gzip.
    // 2026-10-24 prettier sweep (postcard, sound menu, Day book, chart-paper
    // unroll, tide/storm panels): measured 29.1 KiB raw / 6.8 KiB gzip.
    // v1.6 reading panes and controls use 1 KiB of the approved +2 KiB CSS allowance.
    // 2026-11-08 v1.6.0 u-polish (operator ruling U5: +2 KiB raw / +0.6 KiB gzip with offsetting deletions):
    // the merged v1.6.0 lanes measured 38.0 KiB raw / 8.6 KiB gzip; one control family and the merges below bring
    // it to 32.9 KiB raw / 8.0 KiB gzip (33,662 / 8,230 B). Cap = the ruling's ceiling. Deleted or merged (each proven unused or
    // overridden by grep over src/ and tests/, or covered by a shared rule): the pre-v1.6 token aliases
    // (--brass --brass-soft --sea --green --red --shadow) and the unused --chart-up; the prefers-reduced-motion
    // block and the 1 ms unroll/sound overrides (.hb-reduced already cuts every transition); the (pointer: coarse)
    // per-component 44 px heights the any-pointer rule already sets; .hb-reading-actions button and its states
    // (now .hb-control); the second .hb-search-field/.hb-results/.hb-search-hint/.hb-mark/.hb-keys/.hb-tabs/
    // .hb-watch/.hb-ledger-body blocks appended by later lanes; the focus-less :focus:not(:focus-visible)
    // rules; the breath's three ::after hides; the duplicate trunc, ellipsis, list-reset, scroll and hover rules;
    // the panel's 68 px bottom padding for the now focus-revealed "Back to harbour controls"; spaces inside
    // token values (custom properties keep their text verbatim).
    // 2026-11-09 UI art director fixes (B1 guide placement, B2 night washes and the active row, N1-N7): 34,323 B raw /
    // 8,348 B gzip (33.5 / 8.2 KiB), inside the same cap.
    maxRawBytes: 36 * 1024,
    maxGzipBytes: 9.1 * 1024,
    required: true,
  },
};

export const aggregateBudgets = {
  // 2026-10-14 Harbour cutover: the Garden Observatory world (974 KiB gzip at
  // its last measurement, cap 1,024) is deleted. The Harbour measured
  // 1,582.4 KiB raw / 484.4 KiB gzip of JS in total (entry + vendor-react +
  // harbour-app + vendor-rendering). Cap = measured + ~20%, earmarked for the
  // remaining P3/P4 polish; the per-chunk caps above are enforced independently.
  // Re-baselined 2026-10-14 after P6-P8: measured 2,444.1 KiB raw / 736.9 KiB
  // gzip in total. Cap = measured + ~11%.
  // Tightened 2026-10-15 (need-for-speed): measured 2,055.2 KiB raw / 658.8 KiB
  // gzip in total. Cap = measured + ~10%.
  // 2026-10-19 (need-for-speed v1.3.0): measured 2,198.0 KiB raw / 698.6 KiB gzip in total; the
  // growth is lazy (detail panels, prelaunch book, planner worker), not first-frame JS.
  // Re-baselined 2026-10-25 (Living Harbour v1.4.0 on Fair Wind v1.3.0): measured 2,408.3 KiB raw /
  // 774.1 KiB gzip in total (incl. the lazy sound and music chunks). Cap = measured + ~10%.
  // Re-baselined 2026-11-09 for Golden Hour v1.8.0: the feature lanes recorded above also grow
  // on-demand panels and the welcome/subject-link chunks. Measured 3,281,891 B raw / 1,017,204 B gzip.
  // Compact client active IDs remove full coin metadata from DetailPanels: re-measured
  // 2,833,754 B raw / 908,869 B gzip; the feature growth above remains included.
  // Cap = measured + 10%, rounded up to whole bytes; HTML and the OG image are outside this JS total.
  maxJsRawBytes: 3_117_130,
  maxJsGzipBytes: 999_756,
};

export const forbiddenBundleChunks = [
  {
    label: "WebGPU renderer chunk",
    pattern: /^(?:three[.-]webgpu|world-renderer-webgpu|garden-beacon-fire-tsl)-[A-Za-z0-9_-]+\.js$/,
  },
];
