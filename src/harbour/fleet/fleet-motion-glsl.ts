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
vec3 hbSailBreath(vec3 p, vec4 mo, float furl, float node, float seed) {
  float size = -aPaint.x;
  if (!(aMeta.x > 0.5 && aMeta.x < 1.5) || size < 0.01) return p;
  float set = 1.0 - furl;
  float u = clamp(aSailUV.x, 0.0, 1.0), v = clamp(aSailUV.y, 0.0, 1.0);
  bool squareSail = abs(node - 1.0) < 0.5;
  float su = sin(3.14159 * u);
  // the belly: deepest a little aft of the luff and mid-height; a square sail's foot corners stay sheeted
  float shape = squareSail ? su * (0.35 + 0.65 * sin(3.14159 * v)) : sin(3.14159 * pow(u, 0.8)) * (0.3 + 0.7 * sin(3.14159 * v));
  float d = shape * size * 0.075 * mo.x;
  // shiver / flog: a ripple running aft from the luff (luffing head to wind, or shaking through a tack)
  float w = 7.0 + 9.0 * mo.y;
  d += sin(u * 13.0 + v * 2.5 - uTime * w + seed * 1.3) * size * 0.02 * mo.y * (0.3 + 0.7 * su);
  d *= set;
  if (squareSail) p.x += d; else p.z -= d;
  return p;
}
vec3 hbOarStroke(vec3 p, inout vec3 n, vec4 mo, float node, float seed) {
  if (node < 4.5 || mo.w < 0.001) return p;
  float side = aPivot.z >= 0.0 ? 1.0 : -1.0;
  // ~0.5 Hz: catch forward, drive aft with the blade buried, feather and recover with it clear of the water
  float ph = uTime * 3.1416 + seed * 2.1;
  float sweep = 0.3 * cos(ph) * mo.w;
  float lift = (0.12 * max(0.0, -sin(ph)) - 0.025 * max(0.0, sin(ph))) * mo.w;
  mat3 R = hbRotAxis(vec3(1.0, 0.0, 0.0), -side * lift) * hbRotAxis(vec3(0.0, 1.0, 0.0), side * sweep);
  n = R * n;
  return aPivot + R * (p - aPivot);
}
`;
