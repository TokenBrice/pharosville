export const EXPERIENCE_STATES = ["key", "find", "controls", "light", "legend", "ledger", "changelog"];
export const SHELL_MODES = ["blocked", "no-js", "module-failure", "renderer-failure"];

export function parseExperienceFlags(args) {
  if (args["source-details"] !== undefined) throw new Error("--source-details is not supported (S3-P2 was declined).");
  const state = args["experience-state"] ?? (args["reading-key"] ? "key" : args["quick-find"] ? "find" : null);
  if (state !== null && !EXPERIENCE_STATES.includes(state)) throw new Error(`--experience-state needs ${EXPERIENCE_STATES.join("| ")}`);
  if (args["reading-key"] && state !== "key") throw new Error("--reading-key conflicts with --experience-state.");
  const shell = args["capture-shell"] ?? null;
  if (shell !== null && !SHELL_MODES.includes(shell)) throw new Error(`--capture-shell needs ${SHELL_MODES.join("| ")}`);
  if (shell && state) throw new Error("Shell captures cannot open world UI states.");
  const filmstrip = args["cold-filmstrip"];
  let offsets = [];
  if (filmstrip !== undefined) {
    if (typeof filmstrip !== "string" || !filmstrip.trim()) throw new Error("--cold-filmstrip needs comma-separated non-negative seconds.");
    offsets = filmstrip.split(",").map((part) => part.trim() === "" ? NaN : Number(part));
    if (offsets.some((value, index) => !Number.isFinite(value) || value < 0 || (index > 0 && value <= offsets[index - 1]))) {
      throw new Error("--cold-filmstrip offsets must be finite, non-negative and strictly increasing.");
    }
  }
  return { state, shell, offsets };
}

/** Installed before navigation; all timestamps use the unpinned navigation performance clock. */
export function installExperienceObserver() {
  const timing = { firstMeaningfulDomMs: null, firstCompleteWorldMs: null };
  window.__previewExperienceTiming = timing;
  const sample = () => {
    const heading = document.querySelector(".pv-arrival-shell h1, .pharosville-narrow h2");
    if (timing.firstMeaningfulDomMs === null && heading && document.querySelector('nav[aria-label="Pharos analytics"] a')) timing.firstMeaningfulDomMs = performance.now();
    const world = document.querySelector('[data-world-ready="true"]');
    const canvas = document.querySelector('[data-testid="pharosville-canvas"][data-renderer-status="ready"]');
    if (timing.firstCompleteWorldMs === null && world && canvas && !document.querySelector('[data-testid="pharosville-charting-veil"]')) timing.firstCompleteWorldMs = performance.now();
    if (timing.firstMeaningfulDomMs !== null && timing.firstCompleteWorldMs !== null) observer.disconnect();
  };
  const observer = new MutationObserver(sample);
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-world-ready", "data-renderer-status"] });
  sample();
}

export function remainingFilmstripDelay(nominalMs, elapsedMs) {
  return Math.max(0, nominalMs - elapsedMs);
}

/** Called directly after response commit, before any canvas/fleet/readiness waits. */
export async function captureColdFilmstrip(page, offsets, basePath, save) {
  const frames = [];
  for (let index = 0; index < offsets.length; index += 1) {
    const nominalMs = offsets[index] * 1000;
    const elapsedMs = await page.evaluate(() => performance.now());
    const delay = remainingFilmstripDelay(nominalMs, elapsedMs);
    if (delay > 0) await page.waitForTimeout(delay);
    const actualMs = await page.evaluate(() => performance.now());
    const path = `${basePath.replace(/\.png$/i, "")}-cold-${String(index).padStart(2, "0")}.png`;
    const png = await page.screenshot({ animations: "allow", type: "png" });
    const completedMs = await page.evaluate(() => performance.now());
    await save(path, png);
    frames.push({ nominalMs, actualMs, completedMs, path });
  }
  return frames;
}

export async function readExperienceTiming(page) {
  return page.evaluate(() => ({
    firstMeaningfulDomMs: window.__previewExperienceTiming?.firstMeaningfulDomMs ?? null,
    firstCompleteWorldMs: window.__previewExperienceTiming?.firstCompleteWorldMs ?? null,
    responseCommitMs: performance.getEntriesByType("navigation")[0]?.responseStart ?? null,
    observedAtMs: performance.now(),
  }));
}

export async function applyExperienceState(page, state) {
  if (!state) return;
  if (state === "key") {
    const toggle = page.getByRole("button", { name: "Reading key", exact: true });
    await toggle.waitFor({ state: "visible", timeout: 10_000 });
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    await page.getByRole("button", { name: /^(Got it|Close reading key)$/ }).waitFor({ state: "visible" });
    return;
  }
  if (state === "find") {
    await page.keyboard.press("/");
    await page.getByTestId("pharosville-quick-find").waitFor({ state: "visible" });
    return;
  }
  const controls = page.getByTestId("pharosville-world-controls");
  if (await controls.getAttribute("data-expanded") !== "true") await page.getByRole("button", { name: "Explore harbor controls", exact: true }).click();
  if (state === "controls") return;
  if (state === "light") {
    await page.getByRole("button", { name: /^Light and motion:/ }).click();
    await page.getByRole("group", { name: "Light and motion", exact: true }).waitFor({ state: "visible" });
    return;
  }
  if (state === "legend" || state === "changelog") {
    await controls.getByRole("button", { name: "legend", exact: true }).click();
    await page.getByTestId("pharosville-legend-panel").waitFor({ state: "visible" });
    if (state === "changelog") {
      const more = page.getByTestId("pharosville-legend-panel").locator(".pharosville-legend-panel__more");
      if (await more.getAttribute("open") === null) await more.locator("summary").click();
      await page.getByTestId("pharosville-legend-panel").getByRole("button", { name: /changelog/i }).click();
      await page.getByTestId("pharosville-changelog-panel").waitFor({ state: "visible" });
    }
    return;
  }
  await controls.getByRole("button", { name: "Harbor ledger", exact: true }).click();
  await page.getByTestId("pharosville-harbor-ledger-panel").waitFor({ state: "visible" });
}
