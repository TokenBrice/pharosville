// O10 runtime spike harness (in-memory only; touches no repo file). Replay one spike, from the repo root:
//   node scripts/harbour/shot.mjs --url "http://localhost:5173/?t=11&motion=reduce" --out agents/pharosville-ultimate/shots/O10-x.png --seconds 0 \
//     --eval "window.__O10PLAN = {1:[\"sky_value_strong\",\"flags\"],2:[\"coins\",\"burgees\",\"moorings\",\"letters\"]}; $(cat agents/pharosville-ultimate/mockups/O10-spike-harness.js)" \
//     --frame-eval "window.__O10 && window.__O10.step(window.__captureFrameIndex)" --burst 2 --interval 300
// Frame 0 = before; frame N applies PLAN[N] cumulatively; per-step status is console.warn-ed into the report JSON.
// The GLSL strings in each M.<move> are the tested implementation sketches cited in reports/O10-visual-direction.{md,json}.
(async () => {
  // O10 runtime spike harness: per-frame override hooks + named "moves". Read-only on the repo: in-memory only.
  const PLAN = window.__O10PLAN || {};
  const H = window.__harbour, ctx = H.ctx, U = ctx.uniforms, cam = ctx.camera;
  const V3 = cam.position.constructor;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { try { if (fn()) return true; } catch { /* not yet */ } await sleep(250); } return false; };
  const O = window.__O10 = { log: [], err: [], pre: [], post: [], done: new Set(), probes: {} };
  const tod = ctx.timeOfDay, todUpd = tod.update.bind(tod);
  tod.update = function (...a) { const r = todUpd(...a); for (const f of O.pre) { try { f(); } catch (e) { O.err.push("pre:" + e.message); } } return r; };
  const comp = ctx.composer, compRender = comp.render.bind(comp);
  comp.render = function (...a) { for (const f of O.post) { try { f(); } catch (e) { O.err.push("post:" + e.message); } } return compRender(...a); };
  const byName = (n) => { let r = null; ctx.scene.traverse((o) => { if (!r && o.name === n) r = o; }); return r; };
  const sys = (n) => H.systems.find((s) => s.name === n);
  const swap = (src, pairs, tag) => { for (const [a, b] of pairs) { if (!src.includes(a)) { O.err.push(tag + " missing: " + a.slice(0, 56)); continue; } src = src.split(a).join(b); } return src; };
  const patchSM = (mat, pairs, tag, prefix = "") => { mat.fragmentShader = prefix + swap(mat.fragmentShader, pairs, tag); mat.needsUpdate = true; O.log.push(tag); };
  const patchOBC = (mat, pairs, tag) => {
    const ob = mat.onBeforeCompile, key = mat.customProgramCacheKey;
    mat.onBeforeCompile = function (sh, r) { ob.call(this, sh, r); sh.fragmentShader = swap(sh.fragmentShader, pairs, tag); };
    mat.customProgramCacheKey = function () { return key.call(this) + "_" + tag; };
    mat.needsUpdate = true; O.log.push(tag);
  };
  const LUM = "vec3(0.2126, 0.7152, 0.0722)";
  const nr = cam.near.toFixed(2), fr = cam.far.toFixed(1);
  const LINZ = `(${nr} * ${fr} / (${fr} - gl_FragCoord.z * (${fr} - ${nr})))`;

  // ---- readiness: the fleet settled, the house flags hoisted, logos decoded
  let last = -1, stable = 0;
  const okBoats = await until(() => { const b = window.__harbourStats?.renderedBoats ?? 0; stable = (b === last && b > 200) ? stable + 1 : 0; last = b; return stable >= 6; }, 30000);
  const okFlags = await until(() => (sys("identity")?.system?.flags?.sites?.length ?? 0) >= 4, 15000);
  await sleep(2500);

  const M = O.moves = {};
  // O1-I1 hero value lock by day: the visible 5° band reaches mid-blue behind the lantern, the near-horizon lift only
  // below 1°, day horizon + haze ~15 % darker in linear (≈ 8 % sRGB), the far-sea haze ramp from 0.72 R (was 0.62)
  M.sky_value = () => {
    const pairs = [["clamp(e / 6.5, 0.0, 1.0)", "clamp(e / 4.5, 0.0, 1.0)"], ["(1.0 - smoothstep(0.0, 1.6, e)) * 0.35", "(1.0 - smoothstep(0.0, 1.0, e)) * 0.25"]];
    patchSM(byName("sky-backdrop").material, pairs, "o10sky");
    const bm = sys("sky")?.bandPass?.material;
    if (bm && bm.fragmentShader.includes("e / 6.5")) patchSM(bm, pairs, "o10band"); else O.log.push("band: no gradient");
    patchSM(byName("ocean").material, [["uHorizonDist * 0.62", "uHorizonDist * 0.72"]], "o10farsea");
    O.pre.push(() => { const k = 1 - 0.15 * (1 - U.uNight.value); U.uHorizon.value.multiplyScalar(k); U.uHaze.value.multiplyScalar(k); });
  };
  // O1-I1 at about twice the specified strength (the as-specified lock only draws the lit face level with the band):
  // e/3.5, lift below 1 deg at 0.2, day horizon + haze x0.72 linear (≈ -14 % sRGB), far-sea haze from 0.75 R, Pharos limewash +6 %
  M.sky_value_strong = () => {
    const pairs = [["clamp(e / 6.5, 0.0, 1.0)", "clamp(e / 3.5, 0.0, 1.0)"], ["(1.0 - smoothstep(0.0, 1.6, e)) * 0.35", "(1.0 - smoothstep(0.0, 1.0, e)) * 0.2"]];
    patchSM(byName("sky-backdrop").material, pairs, "o10skyS");
    const bm = sys("sky")?.bandPass?.material;
    if (bm && bm.fragmentShader.includes("e / 6.5")) patchSM(bm, pairs, "o10bandS");
    patchSM(byName("ocean").material, [["uHorizonDist * 0.62", "uHorizonDist * 0.75"]], "o10farseaS");
    O.pre.push(() => { const k = 1 - 0.28 * (1 - U.uNight.value); U.uHorizon.value.multiplyScalar(k); U.uHaze.value.multiplyScalar(k); });
    const lh = byName("harbour-lighthouse"); const cloned = new Map(); let n = 0;
    lh.traverse((o) => { if (!o.isMesh || Array.isArray(o.material) || !o.material.color) return; const m = o.material; if (/glass|fire|lens|emiss|window|mirror|crest/i.test(m.name)) return;
      let c = cloned.get(m); if (!c) { c = m.clone(); c.color.multiplyScalar(1.06); cloned.set(m, c); } o.material = c; n++; });
    O.log.push("o10limewash meshes " + n + " mats " + cloned.size);
  };
  // O6-I1 + O2-I5 + O1-I8: house flags at the town's scale (ETH 1.65 -> 1.2, topmast 9 -> 6 m, overview growth +45 -> +25 %),
  // lit as cloth at night (light x (1 - 0.82 n), truck glow 0.16 -> 0.035)
  M.flags = () => {
    const F = sys("identity").system.flags;
    for (const s of F.sites) if ((s.scale ?? 1) > 1.01) s.scale = 1.2;
    F.topmast = 6;
    F.sites.forEach((s, i) => { F.m.compose(F.p.set(s.x, s.y - 0.4, s.z), F.q.identity(), F.s.set(1, F.topmast * (s.scale ?? 1) + 0.4, 1)); F.masts.setMatrixAt(i, F.m); });
    F.masts.instanceMatrix.needsUpdate = true; F.placementDirty = true;
    const fu = F.update.bind(F);
    F.update = function (...a) { this.farScale = 1 + (this.farScale - 1) * (0.25 / 0.45); return fu(...a); };
    O.post.push(() => { const u = F.mat.uniforms, n = U.uNight.value; u.uLight.value.multiplyScalar((1 - 0.82 * n) / Math.max(1 - 0.7 * n, 1e-3)); u.uGlow.value = 0.035 * U.uWindowGlow.value; });
    O.log.push("o10flags " + F.sites.length);
  };
  // O5-I2 (+O1-I2, O5-I1 ground): the print follows its size. discPx from the roundel's own derivatives; k = smoothstep(12, 30 px)
  // (hover/selection restore it); as k -> 0 the paper disc becomes unbleached canvas (cloth +15 %) and the ink keeps its hue at half
  // its value contrast. Same law on the furled cover / brailed bundle print.
  M.coins = () => {
    const law = (g) => `{ float o10px = 0.98 / max(era, 1e-5); float o10k = max(smoothstep(12.0, 30.0, o10px), smoothstep(0.05, 0.5, vFleetMisc.x)); vec3 o10p = t.rgb / max(t.a, 1e-4); float o10paper = smoothstep(0.6, 0.82, min(o10p.r, min(o10p.g, o10p.b))); vec3 o10g = c * 1.15 + 0.012; vec3 o10far = mix(mix(o10g, o10p * ${g}, 0.5), o10g, o10paper); c = mix(c, mix(o10far, o10p * ${g}, o10k), t.a); }`;
    patchOBC(byName("harbour-fleet").material, [["c = c * (1.0 - t.a) + t.rgb * 0.92;", law("0.92")], ["c = c * (1.0 - t.a) + t.rgb * 0.9;", law("0.9")]], "o10coins");
  };
  // O5-I5 / O1-I2: burgees in the same air and pigment: far chroma x0.7, value -20 %, aerial tint at 0.6x the kit cap
  M.burgees = () => {
    const mat = byName("harbour-house-flags").material;
    mat.uniforms.uO10Haze = U.uHaze; mat.uniforms.uO10Fog = U.uFogDensity;
    const fn = `uniform vec3 uO10Haze; uniform float uO10Fog;\nvec3 o10air(vec3 col) { float d = ${LINZ}; float f = smoothstep(300.0, 1000.0, d); float l = dot(col, ${LUM}); col = mix(col, vec3(l), 0.3 * f) * (1.0 - 0.2 * f); float a = min(1.0 - exp(-max(d - 350.0, 0.0) * uO10Fog * 1.6), 0.168); return mix(col, uO10Haze, a); }\nvoid main()`;
    patchSM(mat, [["void main()", fn], ["gl_FragColor = vec4(c * uLight * vShade, 1.0);", "gl_FragColor = vec4(o10air(c * uLight * vShade), 1.0);"]], "o10burgee");
  };
  // O1-I4: quiet moorings: buoys x0.55 beyond 300 m, dropped beyond 900 m (≈ < 2.5 px at the landing)
  M.moorings = () => {
    const f = sys("fleet"), mesh = f.mesh, set = new Map(f.buoyInst.map((b) => [b.inst, b]));
    const sm = mesh.setMatrixAt.bind(mesh), sc = new V3(0.55, 0.55, 0.55);
    let hid = 0;
    for (const b of f.buoyInst) { const d = Math.hypot(b.x - cam.position.x, cam.position.y, b.z - cam.position.z); b.o10far = d > 300; if (d > 900) { mesh.setVisibleAt(b.inst, false); hid++; } }
    mesh.setMatrixAt = function (i, m) { const b = set.get(i); if (b && b.o10far) { const mm = m.clone(); mm.scale(sc); return sm(i, mm); } return sm(i, m); };
    O.log.push(`o10moorings hidden ${hid}/${f.buoyInst.length}`);
  };
  // O1-I9: hairline water lettering: ink density 0.86 -> 0.55, ink #24343C, day halo 0.12 -> 0.04
  M.letters = () => {
    byName("chart-lettering").traverse((o) => {
      if (!o.material || !o.material.fragmentShader) return;
      o.material.fragmentShader = swap(o.material.fragmentShader, [["mix(0.86, 0.13, uNight)", "mix(0.55, 0.13, uNight)"]], "o10letters");
      o.material.needsUpdate = true;
      const u = o.material.uniforms; if (u.uInkDay) u.uInkDay.value.set("#24343C"); if (u.uHalo) u.uHalo.value = 0.04;
    });
    O.log.push("o10letters");
  };
  // fleet shadows at the landing (O7-F2: the 640 m cut vs the 650 m landing): look check only
  M.fleet_shadows = () => { const t = sys("fleet").tier; O.log.push("shadowDist " + t.shadowDist); t.shadowDist = 760; };
  // O3 / O1-I3, O4-I2: retire the runtime mainland
  M.shakkei = () => { const s = byName("shakkei"); s.visible = false; O.log.push("o10shakkei hidden"); };
  // O8-I1: the night bridge palette (tokens from mockups/O8-pilot-chart.css)
  M.ui_night = () => {
    const st = document.createElement("style"); st.id = "o10-ui-night";
    st.textContent = ".hb-ui{--paper:#18212b;--paper-2:#1f2a36;--paper-3:#283543;--ink:#e6dcc6;--ink-2:#c8bda5;--ink-3:#aba18c;--brass:#a88a52;--brass-soft:rgba(207,174,110,.38);--brass-ink:#cfae6e;--red:#ec9c8b;--green:#8fc7a0;--sea:#8ec1d9;--focus:#7fb8ea;--shadow:0 0 0 1px rgba(0,0,0,.35),0 14px 34px -10px rgba(0,0,0,.65)}"
      + ".hb-ui .hb-paper{background-image:radial-gradient(120% 90% at 50% 25%,rgba(207,174,110,.07),rgba(207,174,110,0) 55%,rgba(0,0,0,.2) 100%)!important;border-color:rgba(207,174,110,.38)!important}";
    document.head.appendChild(st); O.log.push("o10ui");
  };
  // O4-I1: mirror clouds normalised by the LOCAL deck strength (behind a front: the new sky's), clamped to [0,1];
  // behind the line they take the deck's slate instead of a bright cream
  M.front_fix = () => {
    patchSM(byName("ocean").material, [
      ["float cc = (1.0 - hbCloudShadow(q)) / uCloudShadow.w;", "float o10bh = uCloudShadowF.w > 0.5 ? 1.0 - smoothstep(-60.0, 60.0, dot(q, uCloudShadowF.xy) - uCloudShadowF.z) : 0.0;\n  float cc = clamp((1.0 - hbCloudShadow(q)) / max(mix(uCloudShadow.w, uCloudShadowG.y, o10bh), 1e-3), 0.0, 1.0);"],
      ["return vec4(cloud, cc * 0.55 * smoothstep(0.03, 0.2, Rm.y));", "cloud = mix(cloud, sky * 0.8, o10bh * smoothstep(0.2, 0.6, uCloudShadowG.y));\n  return vec4(cloud, cc * 0.55 * smoothstep(0.03, 0.2, Rm.y));"],
    ], "o10front");
  };
  // O3-I2: the basin follows the hour: body x the hour's irradiance (hue at 45 %, level at 60 %), normalised to noon so noon is
  // unchanged; the basin lift gated on sun elevation; a 0.12 low-sun Fresnel floor so the dusk sky enters the harbour
  M.basin_hour = () => {
    const sc = {}; for (const k in U) { const v = U[k].value; sc[k] = { value: v && v.clone ? v.clone() : v }; }
    const saved = tod.hour; tod.hour = 12; tod.apply(sc); tod.hour = saved;
    const En = sc.uAmbient.value.clone().add(sc.uSunColor.value.clone().multiplyScalar(Math.max(sc.uSunDir.value.y, 0) * 0.3));
    const om = byName("ocean").material; om.uniforms.uO10En = { value: En };
    patchSM(om, [
      ["body = hbSeaGolden(body, sunSh, sunUp);", `body = hbSeaGolden(body, sunSh, sunUp);
  { vec3 o10E = uAmbient + uSunColor * max(uSunDir.y, 0.0) * sunSh * 0.3; float o10l = dot(o10E, ${LUM}), o10n = dot(uO10En, ${LUM});
    vec3 o10hue = (o10E / max(o10l, 1e-4)) / max(uO10En / max(o10n, 1e-4), vec3(1e-3));
    vec3 o10t = mix(vec3(1.0), o10hue, 0.45) * mix(1.0, clamp(o10l / max(o10n, 1e-4), 0.0, 1.5), 0.6);
    body = mix(body, body * o10t, 1.0 - uNight); }`],
      ["* mix(0.45, 1.0, near) * (1.0 - uNight);", "* mix(0.45, 1.0, near) * (1.0 - uNight) * smoothstep(0.05, 0.35, uSunDir.y);"],
      ["F = min(F * (0.8 + 0.5 * rough) * (1.0 + 0.4 * zm.b), 0.6 + 0.12 * zm.b);", "F = min(F * (0.8 + 0.5 * rough) * (1.0 + 0.4 * zm.b), 0.6 + 0.12 * zm.b);\n  F = max(F, 0.12 * zm.b * (1.0 - smoothstep(0.08, 0.4, uSunDir.y)) * (1.0 - uNight));"],
    ], "o10basin", "uniform vec3 uO10En;\n");
    O.log.push("En " + En.toArray().map((x) => x.toFixed(3)).join(","));
  };
  // O1-I10 / O3-I11 / O2-F13: the overview's sharp band on the harbour (midway Pharos foot -> harbour centre), soft opacity
  // cap 0.55 -> 0.35, bloom threshold +0.3 at overview zoom
  M.overview = () => {
    const P = H.post, L = sys("layout"), lay = ctx.services.get("layout");
    const foot = new V3(...L.hero[0]), mid = new V3(...(lay?.camera?.presets?.heart?.target ?? [-110.31, 20, -98.99]));
    const pu = P.update.bind(P);
    P.update = function (d, t, rig) {
      pu(d, t, rig);
      const x = Math.min(1, Math.max(0, (rig.distance - P.tiltNear) / Math.max(1, P.tiltFar - P.tiltNear))), z = x * x * (3 - 2 * x);
      if (z > 0) { P.tiltShift.offset = (foot.clone().project(cam).y + mid.clone().project(cam).y) / 2; P.tiltShift.blendMode.opacity.value = z * 0.35; P.bloom.luminanceMaterial.threshold = t.bloomThreshold + 0.3 * z; }
      O.probes.tilt = [+P.tiltShift.offset.toFixed(3), +P.tiltShift.blendMode.opacity.value.toFixed(3)];
    };
    O.log.push("o10overview");
  };
  // O4-I7 / O1-I7: the stale fog keeps one identity at every hour: a pale near-neutral sea-smoke (never the hour's navy), a night
  // luminance floor, and lamp halos widened in the bank. The AMOUNT (the data) is untouched.
  M.fog_hue = () => {
    const fe = ctx.composer.passes.flatMap((p) => p.effects || []).find((e) => e.constructor.name === "StaleFogEffect");
    O.post.push(() => { const c = fe.uniforms.get("uFogCol").value; O.probes.fogBefore = c.toArray().map((v) => +v.toFixed(4)); const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722; c.setRGB(l * 1.02, l * 0.99, l * 0.93); });
    O.log.push("o10fog hue");
  };
  M.fog_night = () => {
    const fe = ctx.composer.passes.flatMap((p) => p.effects || []).find((e) => e.constructor.name === "StaleFogEffect");
    O.post.push(() => { const n = U.uNight.value, c = fe.uniforms.get("uFogCol").value, amt = fe.uniforms.get("uAmount").value; c.multiplyScalar(1 + 0.9 * n); H.post.bloom.intensity *= 1 + 0.5 * n * Math.min(1, amt * 2); O.probes.fogAfter = c.toArray().map((v) => +v.toFixed(4)); O.probes.fogAmt = +amt.toFixed(3); });
    O.log.push("o10fog night");
  };
  // O7-I1: the arrival poster, held at its mid-crossfade state over the live world (scale 0.893, opacity 0.6) as shipped ...
  M.poster_today = () => {
    const d = document.createElement("div"); d.id = "o10poster";
    d.style.cssText = "position:fixed;inset:0;z-index:5;pointer-events:none;transform:scale(0.893);opacity:0.6";
    d.innerHTML = '<img src="/harbour/poster-1600.webp" style="display:block;width:100%;height:100%;object-fit:cover"><div id="o10dip" style="position:absolute;inset:0;opacity:0"></div>';
    document.body.appendChild(d); O.log.push("o10poster today");
  };
  // ... and with a feathered edge plus a CSS dip toward night (no new art)
  M.poster_dip = () => {
    const d = document.getElementById("o10poster");
    const mask = "radial-gradient(ellipse 72% 70% at 50% 50%, #000 58%, transparent 100%)";
    d.style.webkitMaskImage = mask; d.style.maskImage = mask;
    d.querySelector("img").style.filter = "brightness(0.5) saturate(0.6) contrast(1.08)";
    const dip = d.querySelector("#o10dip"); dip.style.cssText = "position:absolute;inset:0;opacity:1;background:linear-gradient(rgba(6,12,40,.62),rgba(8,18,46,.5));mix-blend-mode:multiply";
    O.log.push("o10poster dip");
  };
  // O3-I4: glint anti-aliasing: the facet lobe widens with the pixel footprint (energy kept), fades by footprint, never above bloom
  M.glint_aa = () => {
    patchSM(byName("ocean").material, [["float facet = pow(max(dot(Nsp, Hs), 0.0), 1400.0) * smoothstep(0.5, 0.8, nB.a) * (1.0 - far01 * 0.85);",
      "float o10fp = length(fwidth(xz)); float o10n = 1400.0 / (1.0 + 6.0 * o10fp * o10fp);\n  float facet = min(pow(max(dot(Nsp, Hs), 0.0), o10n) * (o10n / 1400.0), 0.9) * smoothstep(0.5, 0.8, nB.a) * (1.0 - smoothstep(0.3, 1.1, o10fp));"]], "o10glint");
  };
  // overview v2: the sharp band centred midway between the Pharos foot and the overview's own target (the inner basin)
  M.overview2 = () => {
    const P = H.post, L = sys("layout"), lay = ctx.services.get("layout");
    const foot = new V3(...L.hero[0]), mid = new V3(...(lay?.camera?.presets?.overview?.target ?? [0, 0, 0]));
    const pu = P.update.bind(P);
    P.update = function (d, t, rig) {
      pu(d, t, rig);
      const x = Math.min(1, Math.max(0, (rig.distance - P.tiltNear) / Math.max(1, P.tiltFar - P.tiltNear))), z = x * x * (3 - 2 * x);
      if (z > 0) { const yf = foot.clone().project(cam).y, ym = mid.clone().project(cam).y; P.tiltShift.offset = (yf + ym) / 2; P.tiltShift.blendMode.opacity.value = z * 0.35; P.bloom.luminanceMaterial.threshold = t.bloomThreshold + 0.3 * z; O.probes.tilt = [+yf.toFixed(3), +ym.toFixed(3), +P.tiltShift.offset.toFixed(3), +P.tiltShift.focusArea.toFixed(3), +P.tiltShift.feather.toFixed(3)]; }
    };
    O.log.push("o10overview2 target " + JSON.stringify(lay?.camera?.presets?.overview?.target));
  };
  // basin v2 = v1 (irradiance tint, lift gated on the sun, low-sun Fresnel floor) + twilight chroma -25 % and a 0.2 floor in twilight
  M.basin_v2 = () => {
    M.basin_hour();
    const om = byName("ocean").material;
    patchSM(om, [
      ["body = mix(body, body * o10t, 1.0 - uNight); }", `body = mix(body, body * o10t, 1.0 - uNight);
    float o10tw = (1.0 - sunUp) * (1.0 - smoothstep(0.55, 0.95, uNight));
    body = mix(body, vec3(dot(body, ${LUM})), 0.25 * o10tw); }`],
      ["F = max(F, 0.12 * zm.b * (1.0 - smoothstep(0.08, 0.4, uSunDir.y)) * (1.0 - uNight));", "F = max(F, mix(0.12, 0.2, (1.0 - sunUp) * (1.0 - smoothstep(0.55, 0.95, uNight))) * zm.b * (1.0 - smoothstep(0.08, 0.4, uSunDir.y)) * (1.0 - smoothstep(0.55, 0.95, uNight)));"],
    ], "o10basin2");
  };
  // overview v3: as v2 but a wider sharp band (focusArea 0.58 -> 0.75, feather 0.38 -> 0.3) so the Pharos AND the moles stay inside
  M.overview3 = () => {
    M.overview2();
    const P = H.post, pu = P.update.bind(P);
    P.update = function (d, t, rig) { pu(d, t, rig); P.tiltShift.focusArea = 0.75; P.tiltShift.feather = 0.3; O.probes.tilt3 = [+P.tiltShift.offset.toFixed(3), P.tiltShift.focusArea, P.tiltShift.feather]; };
    O.log.push("o10overview3");
  };
  M.hour164 = () => { tod.setHour(16.4); O.log.push("hour 16.4"); };

  O.step = async (i) => {
    for (const m of (PLAN[i] || [])) { if (O.done.has(m)) continue; try { M[m](); O.done.add(m); } catch (e) { O.err.push(m + ": " + e.message); } }
    await sleep((PLAN.wait && PLAN.wait[i]) || 1600);
    const res = { i, log: O.log.slice(-6), err: O.err.slice(-6), probes: O.probes };
    console.warn("O10 step " + JSON.stringify(res).slice(0, 380));
    return res;
  };
  const lh = byName("harbour-lighthouse"); const lhMats = new Map();
  if (lh) lh.traverse((o) => { if (o.isMesh) { const m = Array.isArray(o.material) ? o.material[0] : o.material; const k = m.name + "|" + m.uuid.slice(0, 6); lhMats.set(k, (lhMats.get(k) || 0) + 1); } });
  const islandMat = (() => { let m = null; byName("harbour-island")?.traverse((o) => { if (!m && o.isMesh) m = Array.isArray(o.material) ? o.material[0] : o.material; }); return m && (m.name + "|" + m.uuid.slice(0, 6)); })();
  O.probes.lighthouse = { mats: [...lhMats.entries()].slice(0, 8), islandMat };
  const st = await O.step("setup");
  return { okBoats, okFlags, boats: window.__harbourStats.renderedBoats, flagSites: sys("identity")?.system?.flags?.sites?.map((s) => s.scale ?? 1), near: cam.near, far: cam.far, keyHour: +tod.hour.toFixed(2), night: +U.uNight.value.toFixed(3), dist: ctx.rig.distance, setup: st };
})()
