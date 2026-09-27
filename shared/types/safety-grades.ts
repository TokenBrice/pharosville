import { z } from "zod";

export type ReportCardGrade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D" | "F" | "NR";
const REPORT_CARD_GRADE_VALUES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F", "NR"] as const;
export const ReportCardGradeSchema = z.enum(REPORT_CARD_GRADE_VALUES);

export const SafetyGradeEntrySchema = z.object({
  id: z.string(),
  score: z.number().nullable(),
  grade: ReportCardGradeSchema,
});
export type SafetyGradeEntry = z.infer<typeof SafetyGradeEntrySchema>;

export const SafetyGradesResponseSchema = z.object({
  model: z.string(),
  methodologyVersion: z.string(),
  asOfSec: z.number(),
  updatedAt: z.number(),
  publicationStatus: z.string(),
  grades: z.array(SafetyGradeEntrySchema),
});
export type SafetyGradesResponse = z.infer<typeof SafetyGradesResponseSchema>;
