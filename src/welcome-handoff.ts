import { MIN_LONG_SIDE_PX, MIN_SHORT_SIDE_PX } from "./systems/viewport-gate";

/**
 * The welcome's own script, loaded by main.tsx only below the gate (never with the world): "Copy harbour link"
 * (S08-I2, D18's allowlist; no native Share, U14; no QR, S5) and the live window gauge (O8-I5). Plain DOM, no data.
 */
export const CANONICAL_ORIGIN = "https://pharosville.pharos.watch/";
// D18's subject shape: an allowlisted kind and a lowercase id, at most 128 characters. Membership is checked where a
// subject resolves (the edge and the harbour), never here. TODO(d-links merge): read this through the codec
// (shared/lib/selection-link.ts, canonicalSubjectUrl) once it lands; until then a link that fails this shape
// copies the homepage.
const SUBJECT = /^(?:ship|chain|yard|wreck|place)\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** The link the welcome hands to a larger screen: the canonical origin plus a valid subject only. */
export function harbourLink(search: string, hash: string): string {
  const query = new URLSearchParams(search);
  // the legacy fragment is read only when the query names no subject
  const sel = query.has("sel") ? query.get("sel") : new URLSearchParams(hash.replace(/^#/, "")).get("sel");
  return sel && sel.length <= 128 && SUBJECT.test(sel) ? `${CANONICAL_ORIGIN}?sel=${sel}` : CANONICAL_ORIGIN;
}

const SIDES = [["Long side", MIN_LONG_SIDE_PX], ["Short side", MIN_SHORT_SIDE_PX]] as const;

/** This window against the 720×600 the harbour needs, side by side and sorted, so rotating never reads as room. */
function drawGauge(gauge: HTMLElement): void {
  const sides = [Math.max(innerWidth, innerHeight), Math.min(innerWidth, innerHeight)];
  gauge.replaceChildren(...SIDES.map(([label, need], i) => {
    const row = document.createElement("p"), bar = document.createElement("span"), fill = document.createElement("span");
    row.className = "pharosville-gauge__side";
    row.dataset.met = String(sides[i] >= need);
    bar.className = "pharosville-gauge__bar";
    fill.style.setProperty("--pv-fill", String(Math.min(1, sides[i] / need)));
    bar.append(fill);
    row.append(`${label} `, bar, ` ${sides[i]} of ${need} px`);
    return row;
  }));
}

/** Wire the welcome page; returns the teardown main.tsx runs at admission. */
export function startWelcome(page: HTMLElement): () => void {
  const copy = page.querySelector<HTMLButtonElement>("[data-pv-copy]");
  const status = page.querySelector<HTMLElement>("[data-pv-copy-status]");
  const gauge = page.querySelector<HTMLElement>("[data-pv-gauge]");
  const redraw = () => { if (gauge) drawGauge(gauge); };
  const onCopy = () => {
    const url = harbourLink(location.search, location.hash);
    const fallback = () => {
      if (!status) return;
      const label = document.createElement("label"), field = document.createElement("input");
      field.readOnly = true;
      field.value = url;
      label.append("Copy this link: ", field);
      status.replaceChildren(label);
      field.focus();
      field.select();
    };
    if (!navigator.clipboard?.writeText) { fallback(); return; }
    navigator.clipboard.writeText(url).then(() => { if (status) status.textContent = "Link copied. Opens latest readings."; }, fallback);
  };
  copy?.addEventListener("click", onCopy);
  if (copy) copy.hidden = false;
  if (gauge) gauge.hidden = false;
  redraw();
  addEventListener("resize", redraw);
  return () => {
    removeEventListener("resize", redraw);
    copy?.removeEventListener("click", onCopy);
  };
}
