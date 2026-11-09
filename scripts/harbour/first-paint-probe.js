// Q14 / D20 first-paint probe for the arrival filmstrip (exec/notes/v180-u-welcome.md §3): an init script for
// scripts/harbour/shot.mjs that records, in every animation frame from the very first one (before the first paint and
// before src/main.tsx runs), whether the first-byte welcome, the arrival card and the poster generate boxes, with the
// gate stamp, the stage line and data-pv-live. An admitted window must never render #pv-welcome; a blocked one never
// the card or the poster. Read it back after the first world frame, e.g.
//   node scripts/harbour/shot.mjs --url "<base>/" --width 1600 --height 1000 --human --burst 12 --interval 200 \
//     --seconds 0 --wait 0 --init-script-file scripts/harbour/first-paint-probe.js --eval-wait 0 \
//     --eval "(() => { const f = window.__pvFrames; return { frames: f.length, welcomeFrames: f.filter((x) => x.welcome).length, cardFirst: f.findIndex((x) => x.card) }; })()" --out …
// (tests/visual/harbour-dom.spec.ts carries the same probe as a DOM assertion.)
window.__pvFrames = [];
(function tick() {
  const welcome = document.getElementById("pv-welcome");
  const card = document.querySelector(".pv-arrival__card");
  const poster = document.getElementById("pv-poster");
  const stage = document.querySelector(".pv-arrival__stage");
  if (document.documentElement) {
    window.__pvFrames.push({
      t: Math.round(performance.now()),
      welcome: !!welcome && welcome.getClientRects().length > 0,
      card: !!card && card.getClientRects().length > 0,
      poster: !!poster && poster.getClientRects().length > 0,
      gate: document.documentElement.dataset.pvGate || null,
      stage: stage ? stage.textContent : null,
      live: document.documentElement.hasAttribute("data-pv-live"),
    });
  }
  if (window.__pvFrames.length < 2000) requestAnimationFrame(tick);
})();
