/**
 * `?debug=1` mixer (sound-2): per-stem trim, mute and solo over the live
 * engine, "Copy mix" for the tuned sheet, and "Record" for the offline render.
 * Plain DOM inside the lazy audio chunk — nothing of it ships to the world.
 */
import { AUDIO_MIX, AUDIO_STEMS, type AudioMixOverrides } from "./mix";

export function mountAudioDebugMixer(overrides: AudioMixOverrides, onRecord: (seconds: number) => void): () => void {
  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "Audio mixer (debug)");
  panel.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:60;padding:8px 10px;background:rgba(20,22,26,.88);color:#eee;font:11px/1.3 ui-monospace,monospace;border-radius:4px;max-width:340px";
  const title = document.createElement("div");
  title.textContent = "audio mixer — trim dB · mute · solo";
  panel.append(title);
  for (const stem of AUDIO_STEMS) {
    const row = document.createElement("label");
    row.style.cssText = "display:grid;grid-template-columns:60px 1fr 34px 16px 16px;gap:4px;align-items:center";
    const name = document.createElement("span");
    name.textContent = stem;
    const trim = document.createElement("input");
    trim.type = "range";
    trim.min = "-24";
    trim.max = "12";
    trim.step = "0.5";
    trim.value = String(overrides.trimDb[stem]);
    const readout = document.createElement("span");
    readout.textContent = trim.value;
    trim.addEventListener("input", () => {
      overrides.trimDb[stem] = Number(trim.value);
      readout.textContent = trim.value;
    });
    const mute = document.createElement("input");
    mute.type = "checkbox";
    mute.title = `Mute ${stem}`;
    mute.addEventListener("change", () => {
      overrides.muted[stem] = mute.checked;
    });
    const solo = document.createElement("input");
    solo.type = "radio";
    solo.name = "pharosville-audio-solo";
    solo.title = `Solo ${stem} (click again to clear)`;
    solo.addEventListener("click", () => {
      overrides.solo = overrides.solo === stem ? null : stem;
      solo.checked = overrides.solo === stem;
    });
    row.append(name, trim, readout, mute, solo);
    panel.append(row);
  }
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:6px;margin-top:6px";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy mix";
  copy.addEventListener("click", () => {
    const tuned = Object.fromEntries(AUDIO_STEMS.map((stem) => {
      const level = AUDIO_MIX[stem];
      const trim = overrides.trimDb[stem];
      return [stem, { measure: level.measure, calm: level.calm === null ? null : level.calm + trim, storm: level.storm + trim }];
    }));
    void navigator.clipboard?.writeText(JSON.stringify(tuned, null, 2));
  });
  const record = document.createElement("button");
  record.type = "button";
  record.textContent = "Record 60 s";
  record.addEventListener("click", () => onRecord(60));
  actions.append(copy, record);
  panel.append(actions);
  document.body.append(panel);
  return () => panel.remove();
}
