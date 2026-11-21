/**
 * Vertex motion for the fleet draw (lane MOTION): breathing canvas (06-F2, 07-M1 luff) and rowing oars (06-F3).
 * Shared by the colour pass (hbFleetPose) and the shadow depth pass (hbFleetPoseP), so shadows breathe too.
 * Needs: attributes aMeta, aPivot, aPaint, aSailUV, aFurl; uniform uTime (the fleet clock: still under reduced
 * motion); hbRotAxis(). Reads uFleetData texel 2 `mo` = (fill, shake, lantern lit (unused here), oars out).
 *
 * Node space (before the tack mirror and the boom swing): fore-and-aft sails lie in x-y and belly to leeward,
 * -z on the modelled starboard tack (the mirror flips it on port tack); square sails (node 1) hang athwartships
 * from their yard and belly forward (+x). The size of the cloth (m) rides in aPaint.x as a negative number
 * (hull-kit sailExtent); 0 = no breathing (LOD sails).
 */
export const FLEET_MOTION_GLSL = /* glsl */ `
// oars: the furl morph rakes them (1 = at rest); out (0) while she rows
float hbOarFurl(float node, float furl, vec4 mo) {
  return node > 4.5 ? 1.0 - mo.w : furl;
}
vec3 hbSailBreath(vec3 p, inout vec3 n, vec4 mo, float furl, float node, float seed) {
  float size = -aPaint.x;
  if (!(aMeta.x > 0.5 && aMeta.x < 1.5) || size < 0.01) return p;
  float set = 1.0 - furl;
  if (set < 1e-4) return p;
  float u = clamp(aSailUV.x, 0.0, 1.0), v = clamp(aSailUV.y, 0.0, 1.0);
  bool squareSail = abs(node - 1.0) < 0.5;
  const float HB_PI = 3.14159265;
  float sv = squareSail ? (0.35 + 0.65 * sin(HB_PI * v)) : (0.30 + 0.70 * sin(HB_PI * v));
  float dsv = (squareSail ? 0.65 : 0.70) * HB_PI * cos(HB_PI * v);
  float su, dsu;
  if (squareSail) {
    su = sin(HB_PI * u);
    dsu = HB_PI * cos(HB_PI * u);
  } else {
    float ua = pow(max(u, 1e-4), 0.8);
    su = sin(HB_PI * ua);
    dsu = HB_PI * cos(HB_PI * ua) * min(0.8 * ua / max(u, 1e-4), 3.0);
  }
  // deeper analytical belly (0.105): smooth 3D canvas modelling
  float bellyK = 0.105 * mo.x;
  float dBelly = su * sv * size * bellyK;
  float sBellyU = dsu * sv * bellyK;
  float sBellyV = su * dsv * bellyK;
  // slow travelling wind-breath wave across the billow
  float sinV = sin(HB_PI * v), cosV = cos(HB_PI * v), sinU = sin(HB_PI * u);
  float bEnv = (0.35 + 0.65 * sinU) * sinV;
  float bPh = uTime * 1.45 - u * 2.2 - v * 1.1 + seed * 1.9;
  float bK = 0.016 * mo.x * bEnv;
  float dBreath = sin(bPh) * size * bK;
  float sBreathU = -2.2 * cos(bPh) * bK;
  float sBreathV = -1.1 * cos(bPh) * bK;
  // square-sail vertical brail-gather scallop (4 cords -> 5 swags)
  float dScallop = 0.0, sScallopU = 0.0, sScallopV = 0.0;
  if (squareSail) {
    float scK = 0.014 * (0.4 + 0.6 * mo.x);
    float scWave = 0.5 * (1.0 - cos(8.0 * HB_PI * u));
    dScallop = scWave * sinV * size * scK;
    sScallopU = 4.0 * HB_PI * sin(8.0 * HB_PI * u) * sinV * scK;
    sScallopV = scWave * HB_PI * cosV * scK;
  }
  // leech-weighted flutter / luff shiver running aft
  float w = 7.0 + 9.0 * mo.y;
  float flPh = u * 13.0 + v * 2.5 - uTime * w + seed * 1.3;
  float leechW = squareSail ? (0.30 + 0.70 * sinU) : (0.25 + 0.75 * smoothstep(0.15, 0.95, u));
  float flK = (0.022 * mo.y + 0.004 * mo.x) * leechW * (0.25 + 0.75 * sinV);
  float dFlut = sin(flPh) * size * flK;
  float sFlutU = 13.0 * cos(flPh) * flK;
  float sFlutV = 2.5 * cos(flPh) * flK;
  float d = (dBelly + dBreath + dScallop + dFlut) * set;
  float slopeU = clamp((sBellyU + sBreathU + sScallopU + sFlutU) * set, -0.85, 0.85);
  float slopeV = clamp((sBellyV + sBreathV + sScallopV + sFlutV) * set, -0.85, 0.85);
  if (squareSail) p.x += d; else p.z -= d;
  vec3 tu = cross(vec3(0.0, 1.0, 0.0), n);
  float tul = length(tu);
  if (tul > 1e-4) tu /= tul;
  float sgn = squareSail ? (n.x >= 0.0 ? 1.0 : -1.0) : (n.z <= 0.0 ? 1.0 : -1.0);
  vec3 nn = n - tu * slopeU - vec3(0.0, slopeV * sgn, 0.0);
  if (dot(nn, nn) > 1e-5) n = normalize(nn);
  return p;
}
vec3 hbOarStroke(vec3 p, inout vec3 n, vec4 mo, float node, float seed) {
  if (node < 4.5 || mo.w < 0.001) return p;
  float side = aPivot.z >= 0.0 ? 1.0 : -1.0;
  // ~0.5 Hz with fore-to-aft wave ripple, asymmetric drive/recovery, and shaft-axis blade feathering
  float rawPh = uTime * 3.1416 + seed * 2.1 + aPivot.x * 0.18;
  float ph = rawPh + 0.28 * sin(rawPh);
  float sweep = 0.3 * cos(ph) * mo.w;
  float lift = (0.12 * max(0.0, -sin(ph)) - 0.025 * max(0.0, sin(ph))) * mo.w;
  float feather = smoothstep(-0.2, 0.5, -sin(ph)) * 1.15 * mo.w;
  vec3 shaftAxis = normalize(vec3(0.0, -0.22, side));
  mat3 R = hbRotAxis(vec3(1.0, 0.0, 0.0), -side * lift)
         * hbRotAxis(vec3(0.0, 1.0, 0.0), side * sweep)
         * hbRotAxis(shaftAxis, side * feather);
  n = R * n;
  return aPivot + R * (p - aPivot);
}
`;
