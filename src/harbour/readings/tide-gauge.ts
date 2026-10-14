import * as THREE from "three";
import { mergeStaticMeshes } from "../engine/static-merge";
import { TIDE_FULL_SCALE_PCT, tideLevelForPct } from "./bind";

/**
 * THE TIDE GAUGE: the fleet's 7-day supply change as water standing on the harbour-wall gauge
 * (island.glb 'tide_gauge', whose 'tide_gauge_level' empty marks mean sea level). The board's face
 * is z = 0.45 (gauge-local), x ±0.32; its red/white courses are 0.55 m.
 *
 * Scale (printed in brass on the board's right edge): the datum (0 %) sits on the course line at
 * DATUM_Y; full excursion ±TIDE_FULL_SCALE_PCT reaches ±SPAN (down to the sea, up to the top
 * course) through a signed square root, with pins at ±0.5 / 1 / 2 %. The water column rises from the
 * sea to the reading with a bright brass float on top. Stale or unknown: the column goes slate-grey.
 */
export const DATUM_Y = 1.67;
export const SPAN = 1.65;
const FACE_Z = 0.455;
const TICKS_PCT = [0.5, 1, TIDE_FULL_SCALE_PCT];

export class TideGauge {
  readonly group = new THREE.Group();
  private readonly water: THREE.Mesh;
  private readonly waterMat: THREE.MeshStandardMaterial;
  private readonly float: THREE.Mesh;
  private readonly brass: THREE.MeshStandardMaterial;
  private levelS = 0;
  private known = 0;
  private knownS = 0;
  private readonly wet = new THREE.Color("#3CC4B8");
  private readonly grey = new THREE.Color("#6E7C82");

  constructor(levelNode: THREE.Object3D) {
    const parent = levelNode.parent!;
    this.group.name = "tide-gauge-reading";
    this.group.position.set(levelNode.position.x, levelNode.position.y, 0);
    parent.add(this.group);

    this.waterMat = new THREE.MeshStandardMaterial({
      color: this.wet.clone(), roughness: 0.18, metalness: 0, transparent: true, opacity: 0.78,
      emissive: new THREE.Color("#1C6F78"), emissiveIntensity: 0, depthWrite: false,
    });
    this.waterMat.name = "hb_tide_water";
    // unit-height column, scaled per frame; bottom edge at y = 0
    const col = new THREE.BoxGeometry(0.66, 1, 0.06).translate(0, 0.5, FACE_Z + 0.03);
    this.water = new THREE.Mesh(col, this.waterMat);
    this.water.renderOrder = 2;
    this.group.add(this.water);

    this.brass = new THREE.MeshStandardMaterial({ color: new THREE.Color("#D9A64A"), roughness: 0.32, metalness: 0.85, emissive: new THREE.Color("#FFB45A"), emissiveIntensity: 0 });
    this.brass.name = "hb_tide_brass";
    // the float: a brass bar proud of the face, wider than the board so it reads from afar
    this.float = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.13, 0.26).translate(0, 0, FACE_Z + 0.13), this.brass);
    this.float.castShadow = true;
    this.group.add(this.float);

    // datum bar and the graduation pins on the right edge
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color("#2A2620"), roughness: 0.6, metalness: 0.4 });
    const datum = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.05).translate(0, DATUM_Y, FACE_Z + 0.03), dark);
    this.group.add(datum);
    const pinGeo = new THREE.BoxGeometry(0.18, 0.04, 0.05);
    const pins: THREE.Mesh[] = [];
    for (const pct of TICKS_PCT) for (const sgn of [1, -1]) {
      const pin = new THREE.Mesh(pinGeo, this.brass);
      pin.position.set(0.41, DATUM_Y + sgn * tideLevelForPct(pct) * SPAN, FACE_Z - 0.06);
      pin.scale.x = pct === TIDE_FULL_SCALE_PCT ? 1.5 : pct === 1 ? 1.15 : 0.8;
      this.group.add(pin);
      pins.push(pin);
    }
    // the pins never move: one draw
    mergeStaticMeshes(pins, this.group, "tide-pins");
  }

  /** level −1..1 (compressed), known = a current reading exists. */
  update(dt: number, level: number, known: boolean, stale: boolean, lampGlow: number, reduced: boolean): void {
    const k = reduced ? 1 : 1 - Math.exp(-dt * 1.1);
    // unknown drains the well to the sea and parks the float out of sight: never a reading of 0 %
    const target = known ? level : -DATUM_Y / SPAN;
    this.levelS += (target - this.levelS) * k;
    this.known = known && !stale ? 1 : 0;
    this.knownS += (this.known - this.knownS) * (reduced ? 1 : 1 - Math.exp(-dt * 0.8));
    const y = Math.max(0.05, DATUM_Y + this.levelS * SPAN);
    this.water.scale.y = y;
    this.float.position.y = y;
    this.float.visible = known;
    this.waterMat.color.copy(this.grey).lerp(this.wet, this.knownS);
    this.waterMat.opacity = 0.45 + 0.2 * this.knownS;
    this.waterMat.emissiveIntensity = (0.05 + 0.9 * lampGlow) * this.knownS;
    this.brass.emissiveIntensity = 0.6 * lampGlow * (0.4 + 0.6 * this.knownS);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.waterMat.dispose(); this.brass.dispose();
  }
}
