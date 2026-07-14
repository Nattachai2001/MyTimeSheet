import { z } from "zod";

export const OvertimeEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeIn: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timeOut: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  includedLunchTime: z.enum(["YES", "NO"]).optional(),
  detail: z.string().min(1),
  taskCode: z.string().optional(),
  role: z.string().optional()
});

export type OvertimeEntry = z.infer<typeof OvertimeEntrySchema>;

export const OvertimeMonthRecordSchema = z.object({
  schemaVersion: z.literal(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  entries: z.array(OvertimeEntrySchema).default([])
});

export type OvertimeMonthRecord = z.infer<typeof OvertimeMonthRecordSchema>;

export type OvertimeSkipReason = "no-overtime-sheet" | "no-overtime-entries" | "no-capacity";

export interface OvertimeFillResult {
  applied: boolean;
  reason?: OvertimeSkipReason;
  filledCount: number;
  skippedCount: number;
}
