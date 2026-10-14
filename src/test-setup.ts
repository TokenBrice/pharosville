// Shared Vitest setup: deterministic storage, and jsdom's real no-canvas capability.

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(String(key)) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => {
      values.delete(String(key));
    },
    setItem: (key, value) => {
      values.set(String(key), String(value));
    },
  };
}

// Node 26 exposes an experimental global localStorage accessor which emits a
// warning every time Vitest touches it and can shadow jsdom's implementation.
// Install a deterministic Storage object explicitly instead of suppressing
// stderr; suites that exercise unavailable storage still stub it locally.
const testStorage = createMemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testStorage,
  writable: true,
});

// jsdom reports "not implemented" to its virtual console before returning
// null from canvas.getContext(). Tests that need a drawing context install
// their own focused mock; the shared default models jsdom's actual no-canvas
// capability without producing expected-noise errors.
if (typeof HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
    writable: true,
  });
}

export {};

// jsdom has no top layer or keyboard default actions; browser assertions own
// modality/Tab behavior. This models only the native dialog lifecycle.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
}
