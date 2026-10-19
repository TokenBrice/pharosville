/**
 * Generate committed exact sim seeds: node scripts/harbour/build-sim-seeds.mjs
 * Run whenever layout/coast or sim geometry/timing/outing algorithms change.
 * Bump SIM_SEED_VERSION for semantic algorithm changes. No npm/build hook is required.
 * The source digest records the transitive generator inputs; the runtime key covers
 * the version, authored layout/hull dimensions and decoded, bottom-up coast bytes.
 * The worker imports the emitted JSON with ?url: Vite publishes a hashed data asset,
 * fetched alongside layout preparation, rather than compiling the seed into JavaScript.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import sharp from 'sharp';

const root = new URL('../../', import.meta.url);
const source = `
export {buildSimLayout} from './src/harbour/sim/layout-graph.ts';
export {legTimes} from './src/harbour/sim/plan.ts';
export {outingSeed} from './src/harbour/sim/outings.ts';
export {SIM_SEED_VERSION,simSeedKey} from './src/harbour/sim/seeds.ts';`;
const result = await build({ stdin: { contents: source, resolveDir: root.pathname, sourcefile: 'sim-seed-generator.ts', loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{"PROD":true,"DEV":false}' }, metafile: true });
const api = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const layout = JSON.parse(await readFile(new URL('src/harbour/data/layout.json', root), 'utf8'));
const { data, info } = await sharp(new URL('public' + layout.sea.sdf, root).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== info.height) throw new Error('Sim coast must be square');
const coast = { data: new Uint8Array(info.width * info.height), size: info.width, bounds: layout.sea.bounds };
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) coast.data[y * info.width + x] = data[((info.height - 1 - y) * info.width + x) * 4];
const hash = createHash('sha256');
const sources = Object.keys(result.metafile.inputs).filter((p) => p !== 'sim-seed-generator.ts' && !p.startsWith('<')).sort();
for (const path of sources) hash.update(path).update(await readFile(new URL(path, root)));
const L = api.buildSimLayout(layout, coast);
const legs = api.legTimes(L), outings = api.outingSeed(L);
outings.lanes = null; // generation-only distance grid; exact loop/metre answers suffice at runtime
const seed = { version: api.SIM_SEED_VERSION, key: await api.simSeedKey(layout, coast), algorithms: hash.digest('hex'), sources, legs, outings };
await writeFile(new URL('src/harbour/data/sim-seeds.json', root), JSON.stringify(seed) + '\n');
console.info(`Wrote exact sim seeds (${legs.length} leg answers, ${outings.gates.length} gates)`);
