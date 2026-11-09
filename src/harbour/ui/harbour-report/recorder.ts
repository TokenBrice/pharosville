import type { HarbourUIStore } from "../store";
import { getFeed } from "../services";
import { browserObservation, createReadingSession } from "./digest";

let session: ReturnType<typeof createReadingSession> | undefined;
export function readingSession(): ReturnType<typeof createReadingSession> {
  // Admission can tear down and recreate the store; that must not turn this visit's save into its baseline.
  return session ??= createReadingSession(() => localStorage, Date.now());
}

/** App mounts only after admission. No work on the frame callback; one idle write per visit. */
export function recordReading(store: HarbourUIStore): () => void {
  const session = readingSession();
  let pending = false, cancel = () => {};
  let lastModel = store.getSnapshot().model;
  const queue = () => {
    if (pending || !session.canSave() || !store.getSnapshot().model?.hasFleet) return;
    pending = true;
    const save = () => {
      pending = false;
      if (!session.canSave()) return;
      const record = browserObservation(store.getSnapshot().model, getFeed(store.ctx)?.payloads ?? {}, Date.now());
      if (record) session.save(record);
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(save);
      cancel = () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(save, 0);
      cancel = () => clearTimeout(id);
    }
  };
  const unsubscribe = store.subscribe(() => {
    const model = store.getSnapshot().model;
    if (model === lastModel) return;
    lastModel = model;
    queue();
  });
  queue();
  return () => { unsubscribe(); cancel(); };
}
