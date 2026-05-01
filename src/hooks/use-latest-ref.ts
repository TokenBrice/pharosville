// Returns a ref whose `.current` is updated synchronously during render to
// `value`. Replaces the common "mirror state into a ref via useEffect" pattern,
// which can desync under StrictMode double-invoke and runs an extra effect per
// state change. Refs don't trigger re-renders, so writing during render is
// safe; consumers reading `.current` from layout effects, RAF callbacks, or
// event handlers will observe the latest committed value.
import { useRef, type MutableRefObject } from "react";

export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
