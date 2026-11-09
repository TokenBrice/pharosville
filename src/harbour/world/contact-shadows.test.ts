import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWorldUniforms } from "../engine/uniforms";
import { CONTACT_FRAG, CONTACT_VERT, ContactShadows, contactDarkness, FIGURE_DARK, HULL_DARK } from "./contact-shadows";

const scene = new THREE.Scene();

function crowd(positions: Array<[number, number, number, number]>) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), positions.length);
  const m = new THREE.Matrix4();
  positions.forEach(([x, y, z, s], i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s))));
  const root = new THREE.Group();
  root.add(mesh); scene.add(root);
  root.updateMatrixWorld(true);
  return { mesh, root, height: 1.75 };
}

describe("E05 contact quads", () => {
  it("darkens as the sea and the land wear the key light's shadow, by the hour", () => {
    const u = createWorldUniforms(), out = new THREE.Vector2();
    u.uSunDir.value.set(0.3, 0.8, 0.2).normalize(); u.uNight.value = 0;
    u.uSunColor.value.setRGB(3, 2.9, 2.7); u.uHemiSky.value.setRGB(0.25, 0.3, 0.38); u.uFillColor.value.setRGB(0.1, 0.1, 0.12);
    contactDarkness(u, 1, true, out);
    expect(out.x).toBeCloseTo(HULL_DARK, 6);   // a high sun: the sea-golden body darkening in full
    expect(out.y).toBeGreaterThan(0.3); expect(out.y).toBeLessThan(FIGURE_DARK);
    const day = out.clone();
    u.uSunDir.value.set(0.97, 0.02, 0.2).normalize();   // a sun on the horizon: fainter on water and land
    contactDarkness(u, 1, true, out);
    expect(out.x).toBeLessThan(day.x); expect(out.y).toBeLessThan(day.y);
    u.uNight.value = 1; u.uSunDir.value.set(0.2, 0.6, 0.3).normalize(); u.uSunColor.value.setRGB(0.02, 0.025, 0.04);
    contactDarkness(u, 0.7, true, out);
    expect(out.x).toBeLessThan(HULL_DARK * 0.5); expect(out.y).toBeLessThan(day.y);
    contactDarkness(u, 1, false, out);
    expect(out.x).toBe(0);   // Low: its sea wears no sun shadow
  });

  it("packs afloat hulls and shown figures into one instanced draw, Low taking no hulls", () => {
    const c = new ContactShadows(), u = createWorldUniforms();
    expect(c.mesh.material.transparent).toBe(true);
    expect(c.mesh.material.depthWrite).toBe(false);
    expect(c.mesh.castShadow).toBe(false);
    expect(c.mesh.material.blendSrc).toBe(THREE.DstColorFactor);
    c.begin(true);
    c.hull(10, 0.2, -5, 0.5, 4, 1.2, 1.5, 0.6);
    c.hull(0, 0, 0, 0, 4, 1, 1, 0);      // share 0: still the depth shadow's
    c.hull(0, 0, 0, 0, 0, 1, 1, 1);      // degenerate
    const folk = crowd([[1, 2, 3, 1], [0, 0, 0, 0], [4, 5, 6, 0.8]]);   // the zero-scale figure is not out
    folk.root.position.set(100, 0, 0); folk.root.updateMatrixWorld(true);
    c.end(u, 1, [folk], 1, scene);
    expect(c.instances).toBe(3);
    expect(c.mesh.visible).toBe(true);
    expect(c.mesh.geometry.instanceCount).toBe(3);
    const A = c.mesh.geometry.getAttribute("iA").array, B = c.mesh.geometry.getAttribute("iB").array;
    expect([...A.slice(0, 4)].map((v) => +v.toFixed(4))).toEqual([10, 0.2, -5, 0.5]);
    expect([...B.slice(0, 4)].map((v) => +v.toFixed(4))).toEqual([4, 1.2, 1.5, 0.6]);
    expect([...A.slice(4, 7)]).toEqual([101, 2, 3]);                    // feet in world space
    expect(B[7]).toBe(-1);                                              // a figure (negative share)
    expect(B[10]).toBeCloseTo(1.75 * 0.8, 5);                           // height follows the instance scale
    c.begin(false);                                                     // Low
    c.hull(10, 0.2, -5, 0.5, 4, 1.2, 1.5, 1);
    c.end(u, 1, [folk], 0, scene);                                      // nearer than the figure band: no blobs
    expect(c.instances).toBe(0);
    expect(c.mesh.visible).toBe(false);
    folk.root.visible = false;
    c.begin(true); c.end(u, 1, [folk], 1, scene);
    expect(c.instances).toBe(0);                                        // a hidden crowd wears no blobs
    c.dispose();
  });

  it("grows past its first capacity without losing instances", () => {
    const c = new ContactShadows(), u = createWorldUniforms();
    c.begin(true);
    for (let i = 0; i < 1300; i++) c.hull(i, 0, 0, 0, 2, 1, 1, 1);
    c.end(u, 1, [], 0, scene);
    expect(c.instances).toBe(1300);
    expect(c.mesh.geometry.getAttribute("iA").array[1299 * 4]).toBe(1299);
    c.dispose();
  });

  it("sweeps each footprint along its own sun shadow, pulled toward the camera and out of the haze", () => {
    expect(CONTACT_VERT).toContain("-uSunDir.xz / max(uSunDir.y, 0.12) * iB.z");
    expect(CONTACT_VERT).toContain("hbAerialVert(wp)");
    expect(CONTACT_VERT).toContain("toCam * ((hull ? uPull.x : uPull.y)");
    expect(CONTACT_FRAG).toContain("gl_FragColor = vec4(vec3(1.0 - vK * a), 1.0)");
  });
});
