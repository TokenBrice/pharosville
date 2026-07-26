import { BufferGeometry, Group, InstancedMesh, Object3D, ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import {
  createGardenShipGulls,
  GARDEN_GULL_FLOCK_NAME,
  type GardenGullShip,
} from "./garden-ship-gulls";

function gullShip(id: string, mastheadHeight = 6): GardenGullShip {
  return { mastheadHeight, root: new Group(), ship: { id } };
}

function flockMeshes(ship: GardenGullShip): InstancedMesh<BufferGeometry, ShaderMaterial>[] {
  const meshes: InstancedMesh<BufferGeometry, ShaderMaterial>[] = [];
  ship.root.traverse((object: Object3D) => {
    if ((object as InstancedMesh).isInstancedMesh) {
      meshes.push(object as InstancedMesh<BufferGeometry, ShaderMaterial>);
    }
  });
  return meshes;
}

const RUNNING = { reducedMotion: false, timeSeconds: 9.5, visible: true };

describe("createGardenShipGulls", () => {
  it("parents a flock to each hull, so no per-frame placement is needed", () => {
    const ships = [gullShip("usdt"), gullShip("usdc"), gullShip("usde")];
    createGardenShipGulls(ships);

    for (const ship of ships) {
      const flock = ship.root.getObjectByName(GARDEN_GULL_FLOCK_NAME);
      expect(flock).toBeDefined();
      expect(flockMeshes(ship)).toHaveLength(1);
    }
  });

  it("seeds each ship's flock differently and identically across builds", () => {
    const [first] = [gullShip("usdt")];
    const second = gullShip("usdt");
    const other = gullShip("usdc");
    createGardenShipGulls([first!, second, other]);

    const seedsOf = (ship: GardenGullShip) =>
      [...(flockMeshes(ship)[0]!.geometry.getAttribute("aSeed").array as Float32Array)];

    expect(seedsOf(second)).toEqual(seedsOf(first!));
    expect(seedsOf(other)).not.toEqual(seedsOf(first!));
  });

  it("tracks the hull's live masthead, which a hero GLB replaces after load", () => {
    const ship = gullShip("usdt", 3);
    const gulls = createGardenShipGulls([ship]);
    const material = flockMeshes(ship)[0]!.material;

    gulls.update(RUNNING);
    const procedural = material.uniforms.uHeight!.value as number;

    // The GLB resolves and the hull grows taller than the rig that stood in.
    ship.mastheadHeight = 7.5;
    gulls.update(RUNNING);

    expect(material.uniforms.uHeight!.value).toBeGreaterThan(procedural);
  });

  it("freezes at the composed time-zero pose under reduced motion", () => {
    const ship = gullShip("usdt");
    const gulls = createGardenShipGulls([ship]);
    const material = flockMeshes(ship)[0]!.material;

    gulls.update(RUNNING);
    expect(material.uniforms.uTime!.value).toBe(9.5);

    gulls.update({ reducedMotion: true, timeSeconds: 9.5, visible: true });
    expect(material.uniforms.uTime!.value).toBe(0);
  });

  it("stands down with the rest of the world's small life", () => {
    const ship = gullShip("usdt");
    const gulls = createGardenShipGulls([ship]);
    const mesh = flockMeshes(ship)[0]!;

    gulls.update({ reducedMotion: false, timeSeconds: 4, visible: false });
    expect(mesh.visible).toBe(false);

    gulls.update(RUNNING);
    expect(mesh.visible).toBe(true);
  });
});
