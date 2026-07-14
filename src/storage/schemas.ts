import { z } from "zod";

export const SupDailyRecordSchema = z.object({
  schemaVersion: z.literal(1),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.literal("Asia/Bangkok"),
  user: z.object({
    displayName: z.string().min(1)
  }),
  source: z.object({
    workspaceUrl: z.string().url(),
    channelUrl: z.string().url(),
    threadUrl: z.string().url().optional(),
    messageTimestamp: z.string().optional()
  }),
  content: z.object({
    yesterdayRaw: z.string(),
    todayRaw: z.string(),
    yesterdayItems: z.array(z.string()),
    todayItems: z.array(z.string())
  }),
  capturedAt: z.string(),
  updatedAt: z.string(),
  checksum: z.string().min(1)
});

export type SupDailyRecord = z.infer<typeof SupDailyRecordSchema>;

export type DetailSource =
  | "next-report-yesterday"
  | "same-report-today"
  | "missing"
  | "annual-leave"
  | "sick-leave";

export interface ResolvedWorkDetail {
  date: string;
  detail: string;
  source: DetailSource;
  reportDate?: string;
  timeIn?: string;
  timeOut?: string;
  hours?: number;
  includedLunch?: string | null;
  halfDay?: boolean;
  halfDayPeriod?: "morning" | "afternoon";
}
