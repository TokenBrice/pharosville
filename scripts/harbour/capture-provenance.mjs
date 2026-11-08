/** Capture evidence is local diagnostics; unavailable driver identity is explicit, never guessed. */
export function classifyGpu(identity) {
  if (typeof identity !== "string" || !identity.trim() || /^(none|unknown|null|undefined|webgl(?: 2\.0)?|\?)$/i.test(identity.trim())) return "unknown";
  if (/swiftshader|llvmpipe|softpipe|software|swrast|microsoft basic render/i.test(identity)) return "software";
  return /nvidia|geforce|quadro|radeon|\bamd\b|intel|apple|adreno|mali|powervr|tegra/i.test(identity) ? "hardware" : "unknown";
}

export function compareProvenance(before, after) {
  const required = ["gpu", "browser", "backend", "buildHash", "fixtureHash", "viewport", "dpr", "effectiveState"];
  if ([before, after].some((p) => !p || required.some((key) => p[key] == null || p[key] === "") || classifyGpu(p.gpu) !== "hardware")) {
    return { status: "UNVERIFIED", exitCode: [before, after].some((p) => p && classifyGpu(p.gpu) !== "hardware") ? 78 : 1, incompatible: [], reason: "Missing or unverified capture provenance" };
  }
  // Builds may differ in an A/B; both must be identified. Everything controlling pixels must match.
  const incompatible = ["gpu", "browser", "backend", "driver", "fixtureHash", "viewport", "dpr", "effectiveState"]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  return { status: incompatible.length ? "INCOMPATIBLE" : "VERIFIED", incompatible };
}
