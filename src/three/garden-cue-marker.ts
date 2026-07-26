import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from "three";

/**
 * A compact ground/waterline selection cue. It participates in depth testing,
 * so foreground hulls and architecture can occlude it naturally; the old
 * depth-free vertical cylinder painted through unrelated geometry and looked
 * like another translucent world object.
 */
export function createGardenCueMarker(
  color: string,
  opacity: number,
): Mesh<RingGeometry, MeshBasicMaterial> {
  const marker = new Mesh(
    new RingGeometry(0.78, 1, 32),
    new MeshBasicMaterial({
      color,
      depthTest: true,
      depthWrite: false,
      opacity,
      side: DoubleSide,
      transparent: true,
    }),
  );
  marker.name = "garden-cue-marker";
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 5;
  marker.visible = false;
  return marker;
}
