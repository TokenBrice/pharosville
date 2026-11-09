/** The offline mix targets, kept pure so the gate can be checked without a browser. */
interface MixRow {
  integrated: number | null;
  truePeak: number | null;
  energyAbove250?: number;
  duty?: number;
  nearClaps?: number;
  /** the loudest foghorn blast over the stale floor, LU (scenes that sound the horn) */
  hornOverFloor?: number | null;
}
const r1 = (x: number) => Math.round(x * 10) / 10;

export function mixTargets(scenes: Record<string, MixRow>) {
  const T: Array<{ id: string; goal: string; value: number | null | undefined; pass: boolean | null }> = [];
  const target = (id: string, goal: string, value: number | null | undefined, pass: boolean | null) => T.push({ id, goal, value, pass });
  const calm = scenes.calm?.integrated;
  if (calm != null) target("calm-loudness", "calm −26 ± 2 LUFS", calm, calm >= -28 && calm <= -24);
  for (const s of ["breeze", "warning", "storm", "rough"]) {
    if (scenes[s] && calm != null) {
      const over = Number(scenes[s].integrated) - calm;
      target(`${s}-over-calm`, "≤ calm + 6 LU", r1(over), over <= 6);
    }
  }
  if (scenes["storm-rough"] && calm != null) {
    const over = Number(scenes["storm-rough"].integrated) - calm;
    target("storm-rough-over-calm", "both storms at once ≤ calm + 7 LU", r1(over), over <= 7);
  }
  const near = scenes["storm-near"]?.integrated, storm = scenes.storm?.integrated;
  if (near != null && storm != null) target("storm-near-over-storm", "LU over storm (reported)", r1(near - storm), null);
  if (scenes["storm-near"]) target("storm-near-clap", "one near clap scheduled", scenes["storm-near"].nearClaps, scenes["storm-near"].nearClaps === 1);
  if (scenes.stale) {
    const horn = scenes.stale.hornOverFloor;
    target("stale-horn-over-floor", "foghorn ≤ +8 LU over the stale floor", horn, horn != null && horn <= 8);
  }
  for (const [s, row] of Object.entries(scenes)) {
    target(`${s}-true-peak`, "≤ −1 dBTP", row.truePeak, s === "storm-near" ? row.truePeak != null && row.truePeak <= -1 : row.truePeak == null || row.truePeak <= -1);
  }
  const music = scenes["music-alone"];
  if (music && calm != null) {
    const off = r1(calm - Number(music.integrated));
    target("music-under-calm", "6 ± 2 LU under the calm ambience", off, off >= 4 && off <= 8);
  }
  const energy = scenes["breath-12"]?.energyAbove250;
  if (scenes["breath-12"]) target("breath-energy-above-250Hz", "≥ 60 %", energy, energy != null && energy >= 0.6);
  for (const s of ["breath-12", "breath-4", "breath-2.5", "breath-1.2"]) {
    const duty = scenes[s]?.duty;
    if (scenes[s]) target(`${s}-one-at-a-time`, "sounding ≤ 85 % of the time", duty, duty != null && duty <= 0.85);
  }
  return T;
}
