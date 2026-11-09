/** Identity only: membership belongs to the model/registry at the point of resolution. */
export type SubjectKind = "ship" | "chain" | "yard" | "wreck" | "place";
export interface Subject { kind: SubjectKind; id: string }
export interface SubjectLink { subject: Subject | null; chart: boolean; obsolete: boolean }

const KINDS = { ship: "boat", chain: "harbour", yard: "yard", wreck: "wreck", place: "landmark" } as const;
export type SubjectPick = { kind: typeof KINDS[SubjectKind]; id: string };

export function parseSubject(raw: string | null): Subject | null {
  if (raw === "lighthouse") return { kind: "place", id: "pharos" };
  if (!raw || raw.length > 128) return null;
  const m = /^(ship|chain|yard|wreck|place)\.([a-z0-9]+(?:[._-][a-z0-9]+)*)$/.exec(raw);
  return m ? { kind: m[1] as SubjectKind, id: m[2] } : null;
}

export function formatSubject(subject: Subject): string | null {
  const raw = `${subject.kind}.${subject.id}`;
  return parseSubject(raw) ? raw : null;
}

/** A present query sel (even an empty/invalid one) owns the intent over a legacy fragment. */
export function parseSubjectUrl(url: { search: string; hash: string }): SubjectLink {
  const query = new URLSearchParams(url.search), hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const params = query.has("sel") ? query : hash;
  const raw = params.get("sel");
  return { subject: parseSubject(raw), chart: (query.has("chart") ? query : params).get("chart") === "1", obsolete: raw === "pigeonnier" || raw === "place.pigeonnier" };
}

export function canonicalSubjectUrl(subject: Subject | null, chart = false): string {
  const query = new URLSearchParams(), raw = subject && formatSubject(subject);
  if (raw) query.set("sel", raw);
  if (chart) query.set("chart", "1");
  return `https://pharosville.pharos.watch/${query.size ? `?${query}` : ""}`;
}

export function subjectToPick(subject: Subject): SubjectPick { return { kind: KINDS[subject.kind], id: subject.id }; }
export function pickToSubject(hit: SubjectPick): Subject {
  const kind = hit.kind === "boat" ? "ship" : hit.kind === "harbour" ? "chain" : hit.kind === "landmark" ? "place" : hit.kind;
  return { kind, id: hit.id };
}
