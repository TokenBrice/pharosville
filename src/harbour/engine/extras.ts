export const EXTRA_NAMES = ["crowns", "twilight", "nightsky", "storm", "precip", "score", "mirror", "supersample"] as const;
export type ExtraName = typeof EXTRA_NAMES[number];

const enabled = new Set<ExtraName>(EXTRA_NAMES.filter((name) => name !== "mirror"));
const edits = new URLSearchParams(typeof location === "undefined" ? "" : location.search.replace(/\+/g, "%2B")).get("extras");
for (const edit of edits?.split(",") ?? []) {
  if (edit === "none") enabled.clear();
  else if (edit === "all") for (const name of EXTRA_NAMES) enabled.add(name);
  else {
    const name = edit.slice(1) as ExtraName;
    if (EXTRA_NAMES.includes(name)) {
      if (edit[0] === "+") enabled.add(name);
      else if (edit[0] === "-") enabled.delete(name);
    }
  }
}

export function extraEnabled(name: ExtraName): boolean { return enabled.has(name); }
