export type BootFailureKind = "loading" | "shader" | "graphics-buffers" | "context-lost" | "frames" | "unknown";
export interface HarbourLifecycle { state: "DENIED" | "BOOTING" | "READY" | "RECOVERING" | "FAILED"; code: BootFailureKind | null }

export class BootFailure extends Error {
  constructor(readonly code: BootFailureKind, options?: ErrorOptions, message: string = code) { super(message, options); }
}

export const FAILURE_COPY: Record<BootFailureKind, string> = {
  loading: "The harbour’s scenery could not load. Check your connection and try again.",
  shader: "The harbour’s graphics could not be prepared.",
  "graphics-buffers": "This device cannot create the graphics buffers the harbour needs.",
  "context-lost": "The harbour’s graphics could not recover.",
  frames: "The harbour’s graphics could not recover.",
  unknown: "The harbour could not start.",
};

export function failureCode(error: unknown): BootFailureKind { return error instanceof BootFailure ? error.code : "unknown"; }
export function isAbort(error: unknown): boolean { return error instanceof DOMException && error.name === "AbortError"; }
