/**
 * A dead coin's anniversary (D11, data-bound: `deathDate`): today, in the visitor's own calendar, is the same
 * month and day as a FULL death date ("YYYY-MM-DD") from an earlier year. A month-only date ("YYYY-MM") has
 * no day, so it never has an anniversary. The Wreck Cove panel says "anniversary today" for exactly these
 * coins, and the cove's bell rings once per visit for them (src/harbour/audio).
 */
export function anniversaryToday(deathDate: string | null | undefined, today: Date): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deathDate ?? "");
  if (!m) return false;
  return Number(m[1]) < today.getFullYear() && Number(m[2]) === today.getMonth() + 1 && Number(m[3]) === today.getDate();
}

/** The visitor's today; dev builds take `?today=YYYY-MM-DD` to test an anniversary. */
export function worldToday(): Date {
  if (import.meta.env.DEV && typeof location !== "undefined") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(new URLSearchParams(location.search).get("today") ?? "");
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  }
  return new Date();
}
