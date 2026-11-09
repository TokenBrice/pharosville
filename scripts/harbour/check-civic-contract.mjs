#!/usr/bin/env node
// Asserts the node names the runtime finds by name in the civic and hull GLBs
// (docs: agents/2026-10-15-classical-town/PLAN.md section 6.1). A dropped name
// silently kills a feature, so this fails loudly instead. Reads only the glTF
// JSON chunk, so the meshopt-compressed buffers are never decoded.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const civicDir = join(root, "public/harbour/civic");
const kitDir = join(root, "public/harbour/kit");

const range = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** Required nodes per civic kind (manifest key). `anchors` are the painted boards and hoists
 *  the runtime reads from the manifest entry's `anchors` (not GLB nodes): `frieze`,
 *  `grade_board`, `register_flag` (registry), `weather_board`, `signal` (storm station) and
 *  `mover_up|down` (harbourmaster). */
const OFFICE = ["crest_panel", "awning", "flag_pole_top"];
const CIVIC = {
  mint: { required: [...range("press_", 3), "furnace_glow", "wheel", "worker_path"], atLeastOne: /^chimney_\d+$/ },
  burn: { required: ["fire_core", "fire_emitter", "smoke_emitter", "grate_glow", "coin_chute", "coin_chute_end"] },
  shipyard: { required: [...range("slip_", 6), ...range("berth_", 37), ...range("crane_", 3)] },
  "hull-stages": { required: ["keel_only", "ribs", "planked", "painted"] },
  customs: { required: ["flag_pole_top"] },
  // flag_pole_top is ~28 m from the Ethereum office and would be dressed as Ethereum's
  registry: { required: ["bell"], anchors: ["frieze", "grade_board", "register_flag"], forbidden: ["crest_panel", "awning", "flag_pole_top"] },
  stormstation: { required: [], anchors: ["weather_board", "signal"] },
  harbourmaster: { required: [], anchors: ["mover_up", "mover_down"] },
  keeperslog: { required: ["vane"] },
  // T6 works dressing beside a harbour office; anchors.flank.<chain> places it in each office plot
  "office-works": { required: ["works_body", "works_wheel"], anchors: ["flank"] },
};
for (const chain of ["ethereum", "tron", "bsc", "solana", "hyperliquid-l1", "base", "arbitrum", "polygon"]) {
  CIVIC[`harbour-office:${chain}`] = { required: OFFICE };
}

const HULL = {
  nodes: ["sail_main", "bow_cleat", "stern_cleat", "masthead_light", "_heel"],
  // the emblem is mapped onto sail_main (TEXCOORD_0 = sail cloth, TEXCOORD_1 = emblem)
  sailAttributes: ["TEXCOORD_0", "TEXCOORD_1"],
  // docked, the brand rides the cover (boom cover, or a square rig's brailed bundle on the yard): both carry the furl
  // morph the runtime drives (hull-kit.ts), and so does sail_main
  furled: ["sail_main", "sail_cover"],
};

function readGltf(file) {
  const b = readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString("utf8"));
}

const nodeNames = (gltf) => new Set((gltf.nodes ?? []).map((n) => n.name).filter(Boolean));
const rel = (f) => f.slice(root.length + 1);
const failures = [];
const fail = (what, msg) => failures.push(`${what}: ${msg}`);

function checkCivic() {
  const manifest = JSON.parse(readFileSync(join(civicDir, "manifest.json"), "utf8"));
  for (const [kind, rule] of Object.entries(CIVIC)) {
    const spec = manifest.kinds?.[kind];
    if (!spec) { fail(kind, "missing from manifest.json kinds"); continue; }
    const file = join(civicDir, spec.file ?? "");
    if (!spec.file || !existsSync(file)) { fail(kind, `GLB ${spec.file} not found`); continue; }
    const names = nodeNames(readGltf(file));
    const missing = rule.required.filter((n) => !names.has(n));
    if (missing.length) fail(kind, `${rel(file)} missing nodes: ${missing.join(", ")}`);
    if (rule.atLeastOne && ![...names].some((n) => rule.atLeastOne.test(n))) {
      fail(kind, `${rel(file)} has no node matching ${rule.atLeastOne}`);
    }
    const noAnchor = (rule.anchors ?? []).filter((a) => !spec.anchors?.[a]);
    if (noAnchor.length) fail(kind, `manifest.json anchors missing: ${noAnchor.join(", ")}`);
    const present = (rule.forbidden ?? []).filter((n) => names.has(n));
    if (present.length) fail(kind, `${rel(file)} must NOT contain: ${present.join(", ")}`);
    // every manifest node entry must exist in the GLB (the runtime looks them up by manifest name)
    const stale = (spec.nodes ?? []).map((n) => n.name).filter((n) => !names.has(n));
    if (stale.length) fail(kind, `manifest lists nodes absent from ${rel(file)}: ${stale.join(", ")}`);
  }
}

function checkHull(file) {
  const gltf = readGltf(file);
  const names = nodeNames(gltf);
  const missing = HULL.nodes.filter((n) => !names.has(n));
  if (missing.length) fail(rel(file), `missing nodes: ${missing.join(", ")}`);
  const node = (gltf.nodes ?? []).find((n) => n.name === "sail_main");
  const prims = node?.mesh !== undefined ? gltf.meshes[node.mesh].primitives : [];
  const attrs = new Set(prims.flatMap((p) => Object.keys(p.attributes)));
  const noUv = HULL.sailAttributes.filter((a) => !attrs.has(a));
  if (node && noUv.length) fail(rel(file), `sail_main lacks attributes: ${noUv.join(", ")}`);
  for (const name of HULL.furled) {
    const n = (gltf.nodes ?? []).find((x) => x.name === name);
    if (!n) { fail(rel(file), `missing node: ${name}`); continue; }
    const mesh = n.mesh !== undefined ? gltf.meshes[n.mesh] : null;
    if (!mesh?.extras?.targetNames?.includes("furl")) fail(rel(file), `${name} lacks the "furl" morph`);
  }
}

// The Pharos (scripts/harbour/blender/pharos, E18): world/lighthouse-system.ts finds these nodes by name. The lantern is
// the beam origin (FIRE_Z 88.2), the mirror the beam pivot; the emitters seat the fire, the plume and the statue's
// firelight. A moved anchor must move its runtime constant in the same change, so the export and this check pin them.
const PHAROS = {
  file: join(root, "public/harbour/lighthouse.glb"),
  meshes: { tower: "hb_opaque", tower_windows: "hb_window", statue: "hb_opaque", fire_core: "hb_fire", mirror_disc: "hb_mirror", mirror_frame: "hb_opaque" },
  anchors: { lantern: [0, 88.2, 0], mirror: [0, 87.4, 0], fire_emitter: [0, 87.55, 0], smoke_emitter: [0, 96.35, 0] },
  maxTriangles: 8179 + 14000, // v1 + PLAN section 7's E18 allowance
};

function checkPharos() {
  const gltf = readGltf(PHAROS.file);
  const byName = new Map((gltf.nodes ?? []).map((n) => [n.name, n]));
  for (const [name, material] of Object.entries(PHAROS.meshes)) {
    const node = byName.get(name);
    const prim = node?.mesh !== undefined ? gltf.meshes[node.mesh].primitives[0] : undefined;
    if (!prim) fail("lighthouse", `missing mesh node: ${name}`);
    else if (gltf.materials?.[prim.material]?.name !== material) fail("lighthouse", `${name} must use ${material}`);
  }
  for (const [name, at] of Object.entries(PHAROS.anchors)) {
    const t = byName.get(name)?.translation ?? [0, 0, 0];
    if (!byName.has(name)) fail("lighthouse", `missing anchor node: ${name}`);
    else if (t.some((v, i) => Math.abs(v - at[i]) > 1e-3)) fail("lighthouse", `${name} at [${t}] (the runtime expects [${at}])`);
  }
  const tris = (gltf.meshes ?? []).flatMap((m) => m.primitives)
    .reduce((sum, p) => sum + gltf.accessors[p.indices ?? p.attributes.POSITION].count / 3, 0);
  if (tris > PHAROS.maxTriangles) fail("lighthouse", `${tris} triangles > ${PHAROS.maxTriangles} (E18 ceiling)`);
}

checkCivic();
checkPharos();
const hulls = readdirSync(kitDir).filter((f) => /^(hull|titan)_.*\.glb$/.test(f) && !f.endsWith("_lod.glb"));
if (hulls.length === 0) fail("hulls", "no hull_*/titan_* GLBs found in public/harbour/kit");
for (const f of hulls) checkHull(join(kitDir, f));
// every hull GLB on disk is in the manifest (a renamed variant leaves no stale file behind)
const kitManifest = JSON.parse(readFileSync(join(kitDir, "manifest.json"), "utf8"));
const listed = new Set([...(kitManifest.hulls ?? []), ...(kitManifest.lods ?? [])].map((h) => h.file));
for (const f of readdirSync(kitDir).filter((x) => /^(hull|titan)_.*\.glb$/.test(x))) if (!listed.has(f)) fail(f, "not listed in kit manifest.json (stale variant?)");

if (failures.length) {
  console.error(`check-civic-contract: ${failures.length} failure(s)\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-civic-contract: ok (${Object.keys(CIVIC).length} civic kinds, ${hulls.length} hulls/titans, the Pharos)`);
