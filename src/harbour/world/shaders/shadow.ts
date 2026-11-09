import * as THREE from "three";
import { patch } from "../../engine/shader-patch";

/** Keep r186's frustum, bias and intensity, replacing only the kit's Low PCF kernel. */
export function liteShadow(): string {
  return patch(THREE.ShaderChunk.shadowmap_pars_fragment,
    /vec2 texelSize = vec2\( 1\.0 \) \/ shadowMapSize;[\s\S]*?\) \* 0\.2;/,
    "shadow = texture( shadowMap, shadowCoord.xyz );", { id: "world.lite-shadow-pcf" });
}
