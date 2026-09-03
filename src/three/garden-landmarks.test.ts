import {
  Color,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Texture,
  Vector3,
} from "three";
import { CAUSE_HEX, type CauseOfDeath } from "@shared/lib/cause-of-death";
import { describe, expect, it } from "vitest";
import { HARBOR_PALETTE } from "../systems/palette";
import { rimLandAt } from "../systems/garden-rim";
import { HARBOR_WINDOW_EMBER_INTENSITY } from "./garden-harbor-batch";
import {
  CEMETERY_CENTER,
  CEMETERY_RADIUS,
  isWaterTileKind,
  terrainKindAt,
} from "../systems/world-layout";
import type { GraveNode, PigeonnierNode } from "../systems/world-types";
import {
  createGardenCemetery,
  createGardenPigeonnier,
  type GardenCemeteryLandmark,
  WRECK_STAIN_DESATURATION,
  WRECK_STAIN_STONE,
} from "./garden-landmarks";

describe("garden landmarks", () => {
  it("creates a canonical cemetery root with one selectable anchor per grave", () => {
    const graves = [
      grave("grave.alpha", "broken-keel", 7.2, 49.4),
      grave("grave.beta", "skeletal", 8.8, 50.6),
      grave("grave.gamma", "grounded", 9.4, 49.8),
      grave("grave.delta", "shattered", 6.9, 50.8),
    ];

    const cemetery = createGardenCemetery(graves);

    expect(cemetery.root.name).toBe("garden-cemetery");
    expect(cemetery.root.position.toArray()).toEqual([
      CEMETERY_CENTER.x * Math.SQRT2,
      0,
      CEMETERY_CENTER.y * Math.SQRT2,
    ]);
    expect(cemetery.anchors.size).toBe(graves.length);
    expect(cemetery.mistAnchor.parent).toBe(cemetery.root);
    for (const graveNode of graves) {
      const anchor = cemetery.anchors.get(graveNode.detailId);
      expect(anchor?.parent).toBe(cemetery.root);
      expect(anchor?.userData).toMatchObject({
        detailId: graveNode.detailId,
        entityId: graveNode.id,
        kind: "grave",
        label: graveNode.label,
      });
      expect(anchor?.position.x).toBeCloseTo(
        (graveNode.tile.x - CEMETERY_CENTER.x) * Math.SQRT2,
      );
      expect(anchor?.position.z).toBeCloseTo(
        (graveNode.tile.y - CEMETERY_CENTER.y) * Math.SQRT2,
      );
    }
  });

  it("curates the shoal down to a quiet few across five form-distinct hull batches", () => {
    const graves = wreckField(24);
    const cemetery = createGardenCemetery(graves);
    const renderedBatches: InstancedMesh[] = [];
    cemetery.root.traverse((object) => {
      if (
        object instanceof InstancedMesh
        && object.name.startsWith("cemetery-wrecks-")
      ) {
        renderedBatches.push(object);
      }
    });

    expect(renderedBatches.map((batch) => batch.name).sort()).toEqual([
      "cemetery-wrecks-broken-keel",
      "cemetery-wrecks-grounded",
      "cemetery-wrecks-shattered",
      "cemetery-wrecks-sinking-stern",
      "cemetery-wrecks-skeletal",
    ]);
    // The quiet-graveyard curation: a field above the ceiling of 22 renders
    // the authored group plan (5+4+4+5 = 18), not the whole ledger — the
    // all-~89 mound was rejected as carpet, exactly as an even fleet is.
    expect(renderedBatches.reduce((sum, batch) => sum + batch.count, 0)).toBe(18);
    // Five genuinely different hulls, not three repeated shapes.
    expect(new Set(renderedBatches.map((batch) => batch.geometry.getAttribute("position").count)).size)
      .toBe(5);
    expect(hasTexture(cemetery.root)).toBe(false);
    // The concentric pool machinery is gone with the decal it drew.
    for (const batch of renderedBatches) {
      expect(batch.geometry.getAttribute("poolVisible")).toBeUndefined();
      expect(batch.geometry.getAttribute("poolMask")).toBeUndefined();
    }
    const silt = cemetery.root.getObjectByName("cemetery-silt-patch");
    expect(silt).toBeInstanceOf(Mesh);
    const siltPositions = (silt as Mesh).geometry.getAttribute("position");
    let centroidX = 0;
    let centroidZ = 0;
    let topCount = 0;
    for (let index = 0; index < siltPositions.count; index += 1) {
      if (siltPositions.getY(index) < 0.014) continue;
      centroidX += siltPositions.getX(index);
      centroidZ += siltPositions.getZ(index);
      topCount += 1;
    }
    centroidX /= topCount;
    centroidZ /= topCount;
    const topRadii: number[] = [];
    for (let index = 0; index < siltPositions.count; index += 1) {
      if (siltPositions.getY(index) < 0.014) continue;
      topRadii.push(Math.hypot(
        siltPositions.getX(index) - centroidX,
        siltPositions.getZ(index) - centroidZ,
      ));
    }
    // Two offset lobes with harmonic outlines: the stain is not a circle
    // (a concentric decal would ratio at ~1.0).
    expect(Math.max(...topRadii) / Math.min(...topRadii)).toBeGreaterThan(1.35);

    for (const available of [4, 5, 6, 7, 12]) {
      const rendered = wreckBatches(createGardenCemetery(wreckField(available)).root)
        .reduce((sum, batch) => sum + batch.count, 0);
      expect(rendered).toBe(available);
    }
  });

  it("holds the quiet graveyard inside a flat draw budget", () => {
    // The curated field renders 18 wrecks at any ledger size above the
    // ceiling. Five hull batches plus ribs, masts, cloth, the one lantern
    // and the silt stain — ten draws whether the ledger holds 12 dead coins
    // or 300, and the read count never grows past the group plan.
    const small = createGardenCemetery(wreckField(12));
    const large = createGardenCemetery(wreckField(120));
    expect(objectCount(large.root)).toBe(objectCount(small.root));
    expect(objectCount(large.root)).toBe(10);
    const readCount = wreckBatches(large.root).reduce((sum, batch) => sum + batch.count, 0);
    expect(readCount).toBe(18);
  });

  it("sinks 60–80 percent of each hull at the waterline", () => {
    const cemetery = createGardenCemetery(wreckField(24));
    const matrix = new Matrix4();
    const position = new Vector3();
    let checked = 0;
    cemetery.root.traverse((object) => {
      if (!(object instanceof InstancedMesh)) return;
      if (!object.name.startsWith("cemetery-wrecks-")) return;
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, matrix);
        position.setFromMatrixPosition(matrix);
        // Local space: the root sits at y=0, so the instance origin is the
        // canonical WATER_Y and the geometry is sunk around its own y=0.
        expect(position.y).toBeCloseTo(-1.45, 6);
        const tile = {
          x: Math.round(CEMETERY_CENTER.x + position.x / Math.SQRT2),
          y: Math.round(CEMETERY_CENTER.y + position.z / Math.SQRT2),
        };
        const kind = terrainKindAt(tile.x, tile.y);
        expect(isWaterTileKind(kind), `${object.name}.${index} (${kind})`).toBe(true);
        expect(rimLandAt(tile.x, tile.y), `${object.name}.${index}`).toBe(false);
        checked += 1;
      }

      const positions = object.geometry.getAttribute("position");
      const roles = object.geometry.getAttribute("wreckRole");
      const hullYs = Array.from({ length: positions.count }, (_, index) => index)
        .filter((index) => roles.getX(index) === 1)
        .map((index) => positions.getY(index));
      const minY = Math.min(...hullYs);
      const maxY = Math.max(...hullYs);
      const sinkFraction = (0 - minY) / (maxY - minY);
      expect(sinkFraction).toBeGreaterThanOrEqual(0.6);
      expect(sinkFraction).toBeLessThanOrEqual(0.8);
      expect(sinkFraction).toBeCloseTo(object.geometry.userData.sinkFraction, 5);
    });
    // wreckField(24) curates to the 18-wreck group plan; every one sits on
    // the shoals, heeled and 60–80% under.
    expect(checked).toBe(18);
  });

  it("keeps each family readable above water beside a taller stone marker", () => {
    const cemetery = createGardenCemetery(wreckField(24));
    // The hero hull: strictly largest, carries the lantern, reads bigger
    // than the 40–60px subordinate boats on purpose.
    const heroId = cemetery.root.userData.heroGraveId as string;
    const cues = new Set<string>();
    for (const batch of wreckBatches(cemetery.root)) {
      const positions = batch.geometry.getAttribute("position");
      const roles = batch.geometry.getAttribute("wreckRole");
      const yForRole = (role: number) => Array.from(
        { length: positions.count },
        (_, index) => index,
      ).filter((index) => roles.getX(index) === role)
        .map((index) => positions.getY(index));
      const readableSilhouette = yForRole(3);
      const stone = yForRole(4);
      expect(readableSilhouette.length).toBeGreaterThan(0);
      expect(Math.max(...readableSilhouette)).toBeGreaterThan(0.35);
      expect(Math.max(...stone)).toBeGreaterThan(Math.max(...readableSilhouette));
      cues.add(batch.geometry.userData.aboveWaterCue);
      for (const [index, nominalPixels] of batch.userData.nominalPixelLengths.entries()) {
        if (batch.userData.graveIds[index] === heroId) {
          // Hero: clearly the largest read in the zone, still far below the
          // live fleet's sail mass.
          expect(nominalPixels).toBeGreaterThan(60);
          expect(nominalPixels).toBeLessThanOrEqual(80);
          continue;
        }
        expect(nominalPixels).toBeGreaterThanOrEqual(40);
        expect(nominalPixels).toBeLessThanOrEqual(60);
      }
    }
    expect(cues).toEqual(new Set(["intact-gunwale", "angled-halves", "ribs-only"]));
  });

  it("restricts every cause colour to the small marker stain", () => {
    const graves = [
      grave("grave.a", "grounded", CEMETERY_CENTER.x, CEMETERY_CENTER.y),
      grave("grave.b", "sinking-stern", CEMETERY_CENTER.x + 1, CEMETERY_CENTER.y),
      grave("grave.c", "broken-keel", CEMETERY_CENTER.x + 2, CEMETERY_CENTER.y),
      grave("grave.d", "skeletal", CEMETERY_CENTER.x + 3, CEMETERY_CENTER.y),
      grave("grave.e", "shattered", CEMETERY_CENTER.x + 4, CEMETERY_CENTER.y),
    ];
    const cemetery = createGardenCemetery(graves);
    // The furniture era is restored: cloth now exists, and exactly one
    // lantern batch (singular) burns on one substantial wreck.
    expect(cemetery.root.getObjectByName("cemetery-wreck-cloth")).toBeInstanceOf(InstancedMesh);
    expect(cemetery.root.getObjectByName("cemetery-wreck-lantern")).toBeInstanceOf(InstancedMesh);
    expect(cemetery.root.getObjectByName("cemetery-wreck-lanterns")).toBeUndefined();
    const actual = new Set<string>();
    const color = new Color();
    for (const batch of wreckBatches(cemetery.root)) {
      const masks = batch.geometry.getAttribute("causeMask");
      const colors = batch.geometry.getAttribute("color");
      const roles = batch.geometry.getAttribute("wreckRole");
      expect(batch.userData.causeColorRole).toBe("marker-stain-only");
      expect(batch.geometry.userData.causeColorRole).toBe("marker-stain-only");
      expect(Array.from({ length: masks.count }, (_, index) => masks.getX(index)))
        .toContain(0);
      expect(Array.from({ length: masks.count }, (_, index) => masks.getX(index)))
        .toContain(1);
      const causeVertices = Array.from({ length: masks.count }, (_, index) => index)
        .filter((index) => masks.getX(index) === 1);
      expect(causeVertices.every((index) => roles.getX(index) === 2)).toBe(true);
      const causeXs = causeVertices.map((index) => batch.geometry.getAttribute("position").getX(index));
      const causeZs = causeVertices.map((index) => batch.geometry.getAttribute("position").getZ(index));
      const localSpan = Math.max(
        Math.max(...causeXs) - Math.min(...causeXs),
        Math.max(...causeZs) - Math.min(...causeZs),
      );
      // A painted mark, not a floating dot: even the hero-scaled instance
      // keeps the stain under 0.3 world units across.
      const hullScales: number[] = batch.userData.hullScales;
      const maxScale = Math.max(...hullScales);
      expect(localSpan * maxScale).toBeLessThan(0.3);
      const nonCauseColors = new Set(
        Array.from({ length: masks.count }, (_, index) => index)
          .filter((index) => masks.getX(index) === 0)
          .map((index) => new Color(
            colors.getX(index),
            colors.getY(index),
            colors.getZ(index),
          ).getHexString()),
      );
      expect(nonCauseColors.size).toBeGreaterThanOrEqual(4);
      for (let index = 0; index < batch.count; index += 1) {
        batch.getColorAt(index, color);
        actual.add(`#${color.getHexString()}`);
      }
    }
    // De-confetti: each stain keeps its cause hue but is pulled most of the
    // way to the marker stone, so the lifecycle reading survives without
    // dozens of saturated dots scattered on the water.
    const expected = new Set(Object.values(CAUSE_HEX).map((hex) => `#${new Color(hex)
      .lerp(new Color(WRECK_STAIN_STONE), WRECK_STAIN_DESATURATION)
      .getHexString()}`));
    expect(actual).toEqual(expected);
    for (const hex of Object.values(CAUSE_HEX)) {
      expect(actual.has(hex)).toBe(false);
    }
    // The cloth batch's instance colours are rag and mourning tones, never
    // cause colours: cause hue still reaches only the stone stain.
    const cloth = cemetery.root.getObjectByName("cemetery-wreck-cloth") as InstancedMesh;
    const clothColor = new Color();
    const clothColors = new Set<string>();
    for (let index = 0; index < cloth.count; index += 1) {
      cloth.getColorAt(index, clothColor);
      clothColors.add(`#${clothColor.getHexString()}`);
    }
    expect(clothColors).toEqual(new Set(["#6a6a5c", HARBOR_PALETTE.stone_pale]));
  });

  it("scales each hull from its grave value, with one hero above the fleet-safe cap", () => {
    const small = grave("grave.small", "grounded", CEMETERY_CENTER.x, CEMETERY_CENTER.y);
    small.visual.scale = 0.25;
    const large = grave("grave.large", "grounded", CEMETERY_CENTER.x + 1, CEMETERY_CENTER.y);
    large.visual.scale = 0.45;
    const extreme = grave("grave.extreme", "grounded", CEMETERY_CENTER.x + 2, CEMETERY_CENTER.y);
    extreme.visual.scale = 4;
    const batch = wreckBatches(createGardenCemetery([small, large, extreme]).root)[0]!;
    const scales = new Map<string, number>();
    const matrix = new Matrix4();
    const scale = new Vector3();
    for (let index = 0; index < batch.count; index += 1) {
      batch.getMatrixAt(index, matrix);
      matrix.decompose(new Vector3(), new Quaternion(), scale);
      scales.set(batch.userData.graveIds[index], scale.x);
    }
    expect(scales.get(small.id)).toBeLessThan(scales.get(large.id)!);
    expect(scales.get(large.id)).toBeLessThan(batch.userData.hullScaleCap);
    // Subordinate hulls obey the fleet-safe cap exactly as before...
    expect(batch.userData.hullScaleCap).toBe(2);
    // ...while the single hero (here: extreme, the largest substantial
    // grave) is boosted to its own cap so one wreck clearly leads the zone.
    // 2.6 stays far below the live fleet's sail mass and the harbor roofs.
    expect(scales.get(extreme.id)).toBeCloseTo(2.6, 6);
    expect(scales.get(extreme.id)! / scales.get(large.id)!).toBeGreaterThan(1.3);
  });

  it("places each wreck deterministically by id even when input order changes", () => {
    const first = createGardenCemetery(wreckField(16));
    const second = createGardenCemetery(wreckField(16).reverse());
    const read = (cemetery: GardenCemeteryLandmark): Map<string, number[]> => {
      const out = new Map<string, number[]>();
      const matrix = new Matrix4();
      for (const object of wreckBatches(cemetery.root)) {
        for (let index = 0; index < object.count; index += 1) {
          object.getMatrixAt(index, matrix);
          out.set(object.userData.graveIds[index], [...matrix.elements]);
        }
      }
      return out;
    };
    expect([...read(first).entries()].sort()).toEqual([...read(second).entries()].sort());
  });

  it("stands the wreck field up as a populated graveyard with masts, ribs, cloth and one burning lantern", () => {
    const graves = wreckField(40);
    const cemetery = createGardenCemetery(graves);
    const hulls = wreckBatches(cemetery.root);
    const rendered = hulls.reduce((sum, batch) => sum + batch.count, 0);
    // Population floor and ceiling: the shoal reads as a graveyard (a good
    // few unmistakable hulls) without returning to the ~89 mound.
    expect(rendered).toBeGreaterThanOrEqual(16);
    expect(rendered).toBeLessThanOrEqual(22);
    expect(rendered).toBe(18);

    // Per-form pose variation: full 3-axis attitudes hashed from grave ids,
    // so no two rendered instances share a pose and none sits upright.
    const poses = new Set<string>();
    const matrix = new Matrix4();
    const translation = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const up = new Vector3();
    let listed = 0;
    let heeled = 0;
    for (const batch of hulls) {
      for (let index = 0; index < batch.count; index += 1) {
        batch.getMatrixAt(index, matrix);
        matrix.decompose(translation, rotation, scale);
        poses.add(rotation.toArray().map((value) => value.toFixed(5)).join(","));
        up.set(0, 1, 0).applyQuaternion(rotation);
        if (Math.abs(up.y) < Math.cos(0.15)) heeled += 1;
        listed += 1;
      }
    }
    expect(poses.size).toBe(listed);
    expect(heeled).toBe(listed);

    // Furniture batches: per-form rib counts across the curated 18 (their
    // form mix is deterministic — 73 ribs here), a snapped mast on at most
    // a third of the wrecks (6), and rag + mourning pennant hanging from
    // each standing mast (6·2 = 12).
    const ribs = cemetery.root.getObjectByName("cemetery-wreck-ribs") as InstancedMesh;
    const masts = cemetery.root.getObjectByName("cemetery-wreck-masts") as InstancedMesh;
    const cloth = cemetery.root.getObjectByName("cemetery-wreck-cloth") as InstancedMesh;
    expect(ribs).toBeInstanceOf(InstancedMesh);
    expect(masts).toBeInstanceOf(InstancedMesh);
    expect(cloth).toBeInstanceOf(InstancedMesh);
    expect(ribs.count).toBe(73);
    expect(masts.count).toBe(Math.floor(rendered / 3));
    expect(cloth.count).toBe(masts.count * 2);

    // Exactly one still-burning lantern, on the hero, at or below the
    // harbour ember level.
    const lantern = cemetery.root.getObjectByName("cemetery-wreck-lantern") as InstancedMesh;
    expect(lantern).toBeInstanceOf(InstancedMesh);
    expect(lantern.count).toBe(1);
    const heroId = cemetery.root.userData.heroGraveId as string;
    expect(lantern.userData.graveId).toBe(heroId);
    const lanternMaterial = lantern.material as MeshStandardMaterial;
    expect(lanternMaterial.emissiveIntensity).toBeLessThanOrEqual(HARBOR_WINDOW_EMBER_INTENSITY);
    expect(`#${lanternMaterial.emissive.getHexString()}`).toBe(HARBOR_PALETTE.lantern_warm);
  });

  it("keeps the wreckyard a quiet, dark, unevenly grouped graveyard", () => {
    // The third-round contract after two operator rejections (too empty,
    // then an ~89-hull chalk mound with a mast forest and confetti): a few
    // unmistakable dead ships, dark and waterlogged, in loose groups with
    // open water between them, one hero carrying the single lantern.
    const cemetery = createGardenCemetery(shoalField(89));
    const hulls = wreckBatches(cemetery.root);
    const rendered = hulls.reduce((sum, batch) => sum + batch.count, 0);

    // POPULATION: 16..22 rendered from the ~89-grave ledger, never the
    // whole scatter — an even mound is the carpet failure mode.
    expect(rendered).toBeGreaterThanOrEqual(16);
    expect(rendered).toBeLessThanOrEqual(22);
    expect(rendered).toBe(18);

    // VALUE: every non-stain surface — hull bodies, silhouettes, frames,
    // stones, spars, masts, cloth — is darker than the retired chalk tone
    // (#a8aa9f), so nothing in the zone glows against the water.
    const chalk = new Color("#a8aa9f");
    const fieldColors: Color[] = [chalk];
    for (const batch of hulls) {
      const colors = batch.geometry.getAttribute("color");
      const masks = batch.geometry.getAttribute("causeMask");
      for (let index = 0; index < colors.count; index += 1) {
        if (masks.getX(index) === 1) continue;
        fieldColors.push(new Color(colors.getX(index), colors.getY(index), colors.getZ(index)));
      }
    }
    const masts = cemetery.root.getObjectByName("cemetery-wreck-masts") as InstancedMesh;
    fieldColors.push((masts.material as MeshStandardMaterial).color);
    const ribs = cemetery.root.getObjectByName("cemetery-wreck-ribs") as InstancedMesh;
    fieldColors.push((ribs.material as MeshStandardMaterial).color);
    const cloth = cemetery.root.getObjectByName("cemetery-wreck-cloth") as InstancedMesh;
    const clothColor = new Color();
    for (let index = 0; index < cloth.count; index += 1) {
      cloth.getColorAt(index, clothColor);
      fieldColors.push(clothColor.clone());
    }
    for (const color of fieldColors.slice(1)) {
      expect(luminance(color)).toBeLessThan(luminance(chalk) - 0.1);
    }
    // And the field as a whole sits at or below the surrounding water's
    // luminance (vertex-weighted mean vs the day mid band — the shoal's
    // shallow shelf reads lighter than this, so mid is the conservative
    // reference). Replica of garden-water's DAY_MID preset.
    const waterMid = new Color(HARBOR_PALETTE.sky_day_zenith)
      .lerp(new Color(HARBOR_PALETTE.sail_teal), 0.45)
      .lerp(new Color(HARBOR_PALETTE.aurora_green), 0.24);
    const hullLuminance = fieldColors.slice(1)
      .reduce((sum, color) => sum + luminance(color), 0) / (fieldColors.length - 1);
    expect(hullLuminance).toBeLessThanOrEqual(luminance(waterMid));

    // MASTS: at most a third of the rendered wrecks, in the weathered tone
    // — never the near-black drowned tone against pale water.
    expect(masts.count).toBeLessThanOrEqual(Math.floor(rendered / 3));
    expect(`#${(masts.material as MeshStandardMaterial).color.getHexString()}`).toBe("#5d5b52");
    expect(`#${(masts.material as MeshStandardMaterial).color.getHexString()}`).not.toBe("#4a4a44");

    // HERO: exactly one strictly-largest hull, and it carries the lantern.
    const scales: number[] = [];
    const matrix = new Matrix4();
    const decomposeScale = new Vector3();
    for (const batch of hulls) {
      for (let index = 0; index < batch.count; index += 1) {
        batch.getMatrixAt(index, matrix);
        matrix.decompose(new Vector3(), new Quaternion(), decomposeScale);
        scales.push(decomposeScale.x);
      }
    }
    scales.sort((left, right) => right - left);
    expect(scales[0]!).toBeGreaterThan(scales[1]! * 1.25);
    const lantern = cemetery.root.getObjectByName("cemetery-wreck-lantern") as InstancedMesh;
    expect(lantern.count).toBe(1);
    const heroId = cemetery.root.userData.heroGraveId as string;
    expect(lantern.userData.graveId).toBe(heroId);

    // GROUPING: uneven, with real open water. Single-linkage clusters at a
    // 3-tile link distance give three to five loose groups (never one
    // mound, never 18 singletons), and the largest empty circle inside the
    // shoal stays wider than a hull's length — the calm dark region the
    // blurred-frame audit needs.
    const tiles: { x: number; y: number }[] = [];
    for (const batch of hulls) {
      for (let index = 0; index < batch.count; index += 1) {
        batch.getMatrixAt(index, matrix);
        matrix.decompose(new Vector3(), new Quaternion(), decomposeScale);
        const position = new Vector3().setFromMatrixPosition(matrix);
        tiles.push({ x: position.x / Math.SQRT2, y: position.z / Math.SQRT2 });
      }
    }
    const linkDistance = 3;
    const clusters = tiles.map((tile) => [tile]);
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < clusters.length; i += 1) {
        for (let j = i + 1; j < clusters.length; j += 1) {
          const linked = clusters[i]!.some((a) => clusters[j]!.some(
            (b) => Math.hypot(a.x - b.x, a.y - b.y) < linkDistance,
          ));
          if (linked) {
            clusters[i]!.push(...clusters[j]!);
            clusters.splice(j, 1);
            merged = true;
            break outer;
          }
        }
      }
    }
    expect(clusters.length).toBeGreaterThanOrEqual(3);
    expect(clusters.length).toBeLessThanOrEqual(5);
    for (const cluster of clusters) {
      expect(cluster.length).toBeLessThanOrEqual(7);
    }
    let largestEmptyCircle = 0;
    for (let gx = -CEMETERY_RADIUS.x + 0.5; gx <= CEMETERY_RADIUS.x; gx += 0.25) {
      for (let gy = -CEMETERY_RADIUS.y + 0.5; gy <= CEMETERY_RADIUS.y; gy += 0.25) {
        if ((gx / CEMETERY_RADIUS.x) ** 2 + (gy / CEMETERY_RADIUS.y) ** 2 > 0.92) continue;
        let nearest = Number.POSITIVE_INFINITY;
        for (const tile of tiles) {
          nearest = Math.min(nearest, Math.hypot(tile.x - gx, tile.y - gy));
        }
        largestEmptyCircle = Math.max(largestEmptyCircle, nearest);
      }
    }
    expect(largestEmptyCircle).toBeGreaterThanOrEqual(3.5);
  });

  it("builds a compact TON dispatch tower with integration anchors", () => {
    const pigeonnier: PigeonnierNode = {
      detailId: "pigeonnier",
      id: "pigeonnier",
      kind: "pigeonnier",
      label: "Pigeonnier",
      tile: { x: 50, y: 50 },
    };

    const landmark = createGardenPigeonnier(pigeonnier);

    expect(landmark.root.position.toArray()).toEqual([
      50 * Math.SQRT2,
      0,
      50 * Math.SQRT2,
    ]);
    expect(landmark.anchor.parent).toBe(landmark.root);
    expect(landmark.anchor.userData).toEqual({
      detailId: "pigeonnier",
      entityId: "pigeonnier",
      kind: "pigeonnier",
      label: "Pigeonnier",
      selectionRadius: 2.7,
    });
    expect(landmark.dispatchAnchor.parent).toBe(landmark.root);
    expect(landmark.dispatchAnchor.position.y).toBeGreaterThan(6);
    expect(
      landmark.root.getObjectByName("pigeonnier-timber-posts"),
    ).toBeInstanceOf(InstancedMesh);
    expect(
      landmark.root.getObjectByName("pigeonnier-openings"),
    ).toBeInstanceOf(InstancedMesh);
    expect(
      landmark.root.getObjectByName("pigeonnier-ton-pier"),
    ).toBeInstanceOf(Mesh);
    const pier = landmark.root.getObjectByName("pigeonnier-ton-pier") as Mesh;
    expect(pier.rotation.y).toBeCloseTo(0.14);
    const piles = landmark.root.getObjectByName("pigeonnier-pier-piles") as InstancedMesh;
    expect(piles.count).toBe(3);
    const matrix = new Matrix4();
    const pilePositions: number[][] = [];
    for (let index = 0; index < piles.count; index += 1) {
      piles.getMatrixAt(index, matrix);
      pilePositions.push(new Vector3().setFromMatrixPosition(matrix).toArray());
    }
    const expectedPilePositions = [
      [-1.6, -0.78, -0.12],
      [-2.86, -0.74, 0.77],
      [-4.36, -0.82, 0.37],
    ];
    for (const [index, position] of pilePositions.entries()) {
      position.forEach((value, axis) => {
        expect(value).toBeCloseTo(expectedPilePositions[index]![axis]!, 5);
      });
    }
    expect(objectCount(landmark.root)).toBeLessThan(18);
    expect(hasTexture(landmark.root)).toBe(false);
  });

  it("counts today's depeg roost and circles only over named movers", () => {
    const landmark = createGardenPigeonnier({
      detailId: "pigeonnier",
      id: "pigeonnier",
      kind: "pigeonnier",
      label: "Pigeonnier",
      notableMovers: [
        {
          change24hPctLabel: "+2.0%",
          change24hUsdLabel: "+$2.0M",
          detailId: "ship.alpha",
          id: "alpha",
          riskWaterLabel: "Watch Breakwater",
          symbol: "ALPHA",
        },
      ],
      roost: {
        capped: false,
        comparison: 2,
        eventsToday: 3,
        eventsYesterday: 1,
        visualCount: 3,
      },
      tile: { x: 50, y: 50 },
    });
    expect(landmark.roostPigeons.count).toBe(3);
    expect(landmark.moverPigeons.count).toBe(1);

    landmark.update({
      moverPositions: [{ x: 4, y: 0, z: 8 }],
      reducedMotion: false,
      timeSeconds: 12,
    });
    expect(landmark.moverPigeons.visible).toBe(true);
    landmark.update({
      moverPositions: [{ x: 4, y: 0, z: 8 }],
      reducedMotion: true,
      timeSeconds: 0,
    });
    expect(landmark.moverPigeons.visible).toBe(false);
    expect(landmark.roostPigeons.visible).toBe(true);
  });
});

function grave(
  id: string,
  marker: GraveNode["visual"]["marker"],
  x: number,
  y: number,
): GraveNode {
  return {
    detailId: id,
    entry: { causeOfDeath: causeForMarker(marker) } as GraveNode["entry"],
    id,
    kind: "grave",
    label: id.replace("grave.", "").toUpperCase(),
    tile: { x, y },
    visual: { marker, scale: 0.36 },
  };
}

function causeForMarker(marker: GraveNode["visual"]["marker"]): CauseOfDeath {
  switch (marker) {
    case "grounded": return "counterparty-failure";
    case "sinking-stern": return "liquidity-drain";
    case "broken-keel": return "regulatory";
    case "shattered": return "algorithmic-failure";
    case "skeletal": return "abandoned";
  }
}

/** A spread across all five cause forms, scattered over the shoals. */
function wreckField(count: number): GraveNode[] {
  const forms = ["grounded", "sinking-stern", "broken-keel", "skeletal", "shattered"] as const;
  return Array.from({ length: count }, (_, index) => grave(
    `grave.${index}`,
    forms[index % forms.length]!,
    CEMETERY_CENTER.x + ((index % 6) - 2.5) * 0.55,
    CEMETERY_CENTER.y + (Math.floor(index / 6) - 1.5) * 0.48,
  ));
}

/**
 * A shoal-wide spread like the real scatter — golden-angle spiral over the
 * whole graveyard ellipse with varied values — unlike `wreckField`'s tight
 * grid, which cannot exercise grouping.
 */
function shoalField(count: number): GraveNode[] {
  const forms = ["grounded", "sinking-stern", "broken-keel", "skeletal", "shattered"] as const;
  return Array.from({ length: count }, (_, index) => {
    const angle = index * 2.39996;
    const radius = Math.sqrt(((index * 13) % 17) / 17) * 0.94;
    const node = grave(
      `grave.${index}`,
      forms[index % forms.length]!,
      CEMETERY_CENTER.x + Math.cos(angle) * CEMETERY_RADIUS.x * radius,
      CEMETERY_CENTER.y + Math.sin(angle) * CEMETERY_RADIUS.y * radius,
    );
    node.visual.scale = 0.25 + ((index * 7) % 21) / 105;
    return node;
  });
}

/** Rec.709 relative luminance over a THREE.Color's linear components. */
function luminance(color: Color): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function wreckBatches(root: Object3D): InstancedMesh[] {
  const batches: InstancedMesh[] = [];
  root.traverse((object) => {
    if (object instanceof InstancedMesh && object.name.startsWith("cemetery-wrecks-")) {
      batches.push(object);
    }
  });
  return batches;
}

function objectCount(root: import("three").Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof Mesh) count += 1;
  });
  return count;
}

function hasTexture(root: import("three").Object3D): boolean {
  let found = false;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (materialHasTexture(material)) found = true;
    }
  });
  return found;
}

function materialHasTexture(material: Material): boolean {
  return Object.values(material).some((value) => value instanceof Texture);
}
