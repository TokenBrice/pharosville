export interface StaleEvidenceMotionFactors {
  readonly angularFactor: number;
  readonly radiusFactor: number;
}

const FRESH_EVIDENCE_FACTORS: StaleEvidenceMotionFactors = {
  angularFactor: 1,
  radiusFactor: 1,
};

const STALE_EVIDENCE_FACTORS: StaleEvidenceMotionFactors = {
  angularFactor: 0.65,
  radiusFactor: 1.35,
};

export function staleEvidenceMotionFactors(staleEvidence: boolean): StaleEvidenceMotionFactors {
  return staleEvidence ? STALE_EVIDENCE_FACTORS : FRESH_EVIDENCE_FACTORS;
}
