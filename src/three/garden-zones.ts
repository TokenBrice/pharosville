import {
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import {
  GARDEN_ZONE_ROOT_Y,
  gardenAreaDisplayTile,
} from "../systems/garden-observatory-slice";
import {
  DEWS_AREA_PLACEMENTS,
  riskWaterAreaForPlacement,
} from "../systems/risk-water-areas";
import { zoneThemeForTerrain } from "../systems/palette";
import type { AreaNode } from "../systems/world-types";
import { setTilePosition, stableUnit } from "./garden-util";

export interface ZoneVisual {
  area: AreaNode;
  field: Mesh<CircleGeometry, MeshBasicMaterial>;
  rings: Array<Mesh<BufferGeometry, MeshBasicMaterial>>;
  root: Group;
}

export interface GardenWeatherVisual {
  phase: number;
  root: Group;
  streaks: LineSegments<BufferGeometry, LineBasicMaterial>;
}

export function createZone(area: AreaNode): ZoneVisual {
  const placement = area.riskPlacement
    ?? (area.band ? DEWS_AREA_PLACEMENTS[area.band] : "safe-harbor");
  const definition = riskWaterAreaForPlacement(placement);
  const theme = zoneThemeForTerrain(definition.terrain);
  const danger = area.band === "DANGER";
  const radius = 5.2 + Math.min(3.8, Math.sqrt(Math.max(1, area.count ?? 1)) * 0.78);
  const root = new Group();
  setTilePosition(root, gardenAreaDisplayTile(area), GARDEN_ZONE_ROOT_Y);
  root.scale.set(radius * 1.25, 1, radius * 0.76);

  const field = new Mesh(
    new CircleGeometry(1, 48),
    new MeshBasicMaterial({
      color: theme.base,
      depthWrite: false,
      opacity: danger ? 0.58 : 0.34,
      side: DoubleSide,
      transparent: true,
    }),
  );
  field.rotation.x = -Math.PI / 2;
  field.renderOrder = 2;
  root.add(field);

  const rings = ([
    [0.4, 0.415, 0.13],
    [0.68, 0.7, 0.19],
    [0.96, 1, 0.32],
  ] as const).map(([inner, outer, opacity], index) => {
    const ring = new Mesh(
      createBrokenRingGeometry(
        inner,
        outer,
        stableUnit(`zone-arc.${area.id}.${index}`),
      ),
      new MeshBasicMaterial({
        color: theme.label.accent,
        depthWrite: false,
        opacity: danger ? opacity * 1.28 : opacity,
        side: DoubleSide,
        transparent: true,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025 + index * 0.008;
    ring.renderOrder = 3;
    root.add(ring);
    return ring;
  });
  return { area, field, rings, root };
}

function createBrokenRingGeometry(
  innerRadius: number,
  outerRadius: number,
  seed: number,
): BufferGeometry {
  const segments = 48;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment < segments; segment += 1) {
    const progress = (segment / segments + seed * 0.24) % 1;
    const visible = (progress > 0.06 && progress < 0.42)
      || (progress > 0.54 && progress < 0.83);
    if (!visible) continue;

    const start = (segment / segments) * Math.PI * 2;
    const end = ((segment + 1) / segments) * Math.PI * 2;
    const vertex = positions.length / 3;
    positions.push(
      Math.cos(start) * innerRadius, Math.sin(start) * innerRadius, 0,
      Math.cos(start) * outerRadius, Math.sin(start) * outerRadius, 0,
      Math.cos(end) * innerRadius, Math.sin(end) * innerRadius, 0,
      Math.cos(end) * outerRadius, Math.sin(end) * outerRadius, 0,
    );
    indices.push(
      vertex, vertex + 1, vertex + 2,
      vertex + 2, vertex + 1, vertex + 3,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function createDangerWeather(area: AreaNode): GardenWeatherVisual {
  const root = new Group();
  setTilePosition(root, gardenAreaDisplayTile(area), GARDEN_ZONE_ROOT_Y);
  const points: Vector3[] = [];
  for (let index = 0; index < 32; index += 1) {
    const x = (stableUnit(`rain-x.${area.id}.${index}`) - 0.5) * 15;
    const z = (stableUnit(`rain-z.${area.id}.${index}`) - 0.5) * 8;
    const y = 1.4 + stableUnit(`rain-y.${area.id}.${index}`) * 7;
    points.push(
      new Vector3(x, y, z),
      new Vector3(x - 0.42, y - 2.1, z + 0.18),
    );
  }
  const streaks = new LineSegments(
    new BufferGeometry().setFromPoints(points),
    new LineBasicMaterial({
      color: "#b7c9ca",
      depthWrite: false,
      opacity: 0.16,
      transparent: true,
    }),
  );
  streaks.name = "danger-rain-curtain";
  root.add(streaks);
  return {
    phase: stableUnit(`rain-phase.${area.id}`),
    root,
    streaks,
  };
}
