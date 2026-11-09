#!/usr/bin/env node
// Counts the same per-mesh positions and primitive indices as GLTFLoader + bakeGltf(wreck).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kit = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/harbour/kit");
const path = resolve(kit, "manifest.json");
let source = readFileSync(path, "utf8");
const manifest = JSON.parse(source);
for (const item of manifest.wreck_kit.items) {
  const buffer = readFileSync(resolve(kit, item.file));
  const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString("utf8"));
  const count = (bare) => {
    let vertices = 0, indices = 0;
    const walk = (i) => {
      const node = gltf.nodes[i];
      if (bare && node.name === "epitaph") return;
      if (node.mesh !== undefined) for (const primitive of gltf.meshes[node.mesh].primitives) {
        vertices += gltf.accessors[primitive.attributes.POSITION].count;
        indices += gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count;
      }
      for (const child of node.children ?? []) walk(child);
    };
    for (const root of gltf.scenes[gltf.scene ?? 0].nodes) walk(root);
    return { vertices, indices };
  };
  const capacity = { full: count(false), ...(item.kind === "wreck" && item.nodes.some((n) => n.name === "epitaph") ? { bare: count(true) } : {}) };
  if (process.argv.includes("--check")) {
    if (JSON.stringify(item.capacity) !== JSON.stringify(capacity)) throw new Error(`Stale wreck capacity: ${item.id}`);
  } else {
    // Keep unrelated authored manifest bytes intact (other asset lanes own them).
    const id = source.indexOf(`"id": ${JSON.stringify(item.id)}`, source.indexOf('"wreck_kit"'));
    const start = source.lastIndexOf("{", id);
    let end = start, depth = 0, quoted = false, escaped = false;
    for (; end < source.length; end++) {
      const c = source[end];
      if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) { end++; break; }
    }
    const original = source.slice(start, end), object = JSON.parse(original);
    const indent = source.slice(source.lastIndexOf("\n", id) + 1, id);
    const value = JSON.stringify(capacity, null, 1).replaceAll("\n", `\n${indent}`);
    let updated;
    if (object.capacity) {
      const offset = original.indexOf('"capacity": '), tail = original.slice(offset + 12);
      const old = JSON.stringify(object.capacity, null, 1).replaceAll("\n", `\n${indent}`);
      updated = original.slice(0, offset + 12) + tail.replace(old, value);
    } else {
      const line = original.lastIndexOf("\n");
      updated = original.slice(0, line) + `,\n${indent}"capacity": ${value}` + original.slice(line);
    }
    source = source.slice(0, start) + updated + source.slice(end);
  }
}
if (!process.argv.includes("--check")) writeFileSync(path, source);
console.log(`Wreck capacity ${process.argv.includes("--check") ? "verified" : "generated"}: ${manifest.wreck_kit.items.length} items`);
