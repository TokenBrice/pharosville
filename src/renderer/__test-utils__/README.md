# Renderer test utilities

Small kit of mocks and factories for the render pipeline tests. Import from the
package barrel:

```ts
import {
  buildRecordingCanvasContext,
  createCanvasContextStub,
  createDrawInput,
  createGradientStub,
} from "../__test-utils__";
```

## When to use which canvas stub

There are **two** canvas stubs by design — pick the one that matches the
assertion style your test needs.

### `createCanvasContextStub(methods, initialValues?)` — *spy-only*

Backed by `vi.fn()` per method. Use when you only need `toHaveBeenCalled`,
`toHaveBeenCalledWith`, call counts, or to attach `.mockReturnValueOnce(...)`.
No call ordering across different methods is preserved.

```ts
const ctx = createCanvasContextStub(["fillRect"], { fillStyle: "" });
drawNightTint({ ctx, width: 800, height: 600, ... }, 1);
expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
```

### `buildRecordingCanvasContext(options?)` — *ordered call log*

Returns `{ ctx, calls, setStyles, callsTo, wasCalledWith, reset }`. Every
recorded method appends to `calls` in chronological order, and property writes
(`fillStyle`, `lineWidth`, …) are captured in `setStyles` via a Proxy. Use when
the test asserts **call ordering** between primitives, iterates the full call
log, or wants both spies and property snapshots from the same stub.

```ts
const stub = buildRecordingCanvasContext({ initialValues: { fillStyle: "" } });
drawSquadDistressFlag(stub.ctx, { x: 100, y: 50 });
expect(stub.setStyles.fillStyle).toBe(SQUAD_DISTRESS_FLAG_HEX);
expect(stub.callsTo("fillRect")).toHaveLength(1);
expect(stub.wasCalledWith("closePath")).toBe(true);
```

Pass `methods` to override the default set, or `returningMethods` for stubs
that must return a value (gradients, patterns, `getImageData` results):

```ts
const stub = buildRecordingCanvasContext({
  returningMethods: { createLinearGradient: createGradientStub },
});
```

## `createGradientStub()`

One-liner producing `{ addColorStop: vi.fn() }`. Use as the return value of
`createLinearGradient` / `createRadialGradient` mocks when the test does not
otherwise care about the gradient itself.

```ts
const ctx = createCanvasContextStub(["fill"], {
  createRadialGradient: vi.fn(() => createGradientStub()),
});
```

## `createDrawInput(overrides?)`

Builds a fully-typed `DrawPharosVilleInput` with conservative defaults — empty
ship list, identity camera, zero-time motion, no assets — so a layer test only
overrides the fields it cares about. Pair with either canvas stub above.

```ts
const ctx = createCanvasContextStub(["fillRect"]);
const input = createDrawInput({ ctx, width: 800, height: 600 });
drawNightTint(input, 0.5);
expect(input.ctx.fillRect).toHaveBeenCalledTimes(1);
```

## Scope notes

These utilities are *additive*. Existing tests are not migrated; adopt them
opportunistically when touching a render test. A camera/viewport factory was
considered but skipped — `fitCameraToMap({ width: 1440, height: 1000, map })`
is a one-liner and motion-plan defaults are already covered by
`createDrawInput`.
