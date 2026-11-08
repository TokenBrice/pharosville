import type { EndpointTruth } from "../model/types";

export type ReadingName = "Supply" | "Chain comparisons" | "PSI" | "Peg readings" | "Stress readings" | "Safety grades" | "Flow readings";
type Truth = Pick<EndpointTruth, "state" | "reason" | "sourceUpdatedAtMs">;
export type TruthCopyInput =
  | { kind: "reading"; reading: ReadingName; truth: Truth; coveragePct?: number }
  | { kind: "retained-heading" }
  | { kind: "absent-row"; reading: "peg" | "stress" }
  | { kind: "grade"; grade: string | null | undefined; truth: Truth }
  | { kind: "observed-empty"; reading: "shoals" | "alerts" }
  | { kind: "psi-qualification"; dewsUnavailable?: boolean; depegEventsUnavailable?: boolean };

/** One vocabulary for captions, accessible names and disclosures. No clock reads. */
export function truthCopy(input: TruthCopyInput): string {
  switch (input.kind) {
    case "retained-heading": return "Last received values";
    case "absent-row": return `No ${input.reading} reading is available for this coin.`;
    case "observed-empty": return input.reading === "shoals"
      ? "No off-peg coins were observed among covered coins."
      : "No Alert-or-worse signals were observed among covered coins.";
    case "grade": return input.truth.state !== "current"
      ? truthCopy({ kind: "reading", reading: "Safety grades", truth: input.truth })
      : !input.grade || input.grade === "NR" ? "Not rated." : input.grade;
    case "psi-qualification": {
      const missing = input.dewsUnavailable && input.depegEventsUnavailable ? "stress signals and depeg events"
        : input.dewsUnavailable ? "stress signals" : input.depegEventsUnavailable ? "depeg events" : null;
      return missing ? `Computed without ${missing}. A horn shutter narrows the beam until those inputs return.` : "";
    }
    case "reading": {
      const { reading, truth } = input;
      const stamp = truth.sourceUpdatedAtMs;
      const dated = stamp != null && Number.isFinite(stamp) && stamp >= 0 && !Number.isNaN(new Date(stamp).getTime());
      const asOf = dated ? new Date(stamp).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : null;
      const sentence = truth.state === "stale"
        ? `${reading}: stale. ${asOf ? `Last observed ${asOf}.` : "Source freshness is unverified."}`
        : truth.state === "current" && asOf ? `${reading}: current. Updated ${asOf}.`
          : truth.state === "unknown" || truth.reason === "unverified-source" || truth.state === "current"
            ? `${reading}: unavailable. Source freshness is unverified.` : `${reading}: unavailable.`;
      return input.coveragePct != null && Number.isFinite(input.coveragePct) && input.coveragePct >= 0 && input.coveragePct < 100
        ? `${reading}: partial. Observed across ${input.coveragePct}% of tracked supply. ${sentence}` : sentence;
    }
  }
}
