import { z } from "zod";

export const LeaveTypeSchema = z.enum(["annual", "sick"]);
export type LeaveType = z.infer<typeof LeaveTypeSchema>;

export const HalfDayPeriodSchema = z.enum(["morning", "afternoon"]);
export type HalfDayPeriod = z.infer<typeof HalfDayPeriodSchema>;

export const HALF_DAY_SCHEDULE = {
  morning: { timeIn: "09:00", timeOut: "12:00", hours: 3, label: "morning 09:00–12:00" },
  afternoon: { timeIn: "13:00", timeOut: "18:00", hours: 5, label: "afternoon 13:00–18:00" }
} as const;

export const LeaveEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: LeaveTypeSchema,
  detail: z.string().optional(),
  halfDay: z.boolean().optional(),
  halfDayPeriod: HalfDayPeriodSchema.optional()
});

export type LeaveEntry = z.infer<typeof LeaveEntrySchema>;

export const LeaveMonthRecordSchema = z.object({
  schemaVersion: z.literal(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  entries: z.array(LeaveEntrySchema).default([])
});

export type LeaveMonthRecord = z.infer<typeof LeaveMonthRecordSchema>;

export function normalizeLeaveEntry(entry: LeaveEntry): LeaveEntry {
  if (entry.type !== "sick" || !entry.halfDay) {
    return {
      date: entry.date,
      type: entry.type,
      detail: entry.detail?.trim() || undefined,
      halfDay: undefined,
      halfDayPeriod: undefined
    };
  }

  return {
    date: entry.date,
    type: "sick",
    detail: entry.detail?.trim() || undefined,
    halfDay: true,
    halfDayPeriod: entry.halfDayPeriod === "afternoon" ? "afternoon" : "morning"
  };
}

export function resolveHalfDayPeriod(entry: Pick<LeaveEntry, "halfDay" | "halfDayPeriod">): HalfDayPeriod | undefined {
  if (!entry.halfDay) return undefined;
  return entry.halfDayPeriod === "afternoon" ? "afternoon" : "morning";
}

export function halfDaySchedule(period: HalfDayPeriod) {
  return HALF_DAY_SCHEDULE[period];
}

export function defaultLeaveDetail(
  type: LeaveType,
  options?: { halfDay?: boolean; halfDayPeriod?: HalfDayPeriod }
): string {
  if (type === "annual") return "Annual leave";
  if (!options?.halfDay) return "Sick leave";
  const period = options.halfDayPeriod ?? "morning";
  return `Sick leave (half day · ${HALF_DAY_SCHEDULE[period].label})`;
}

export function formatLeaveDetail(
  type: LeaveType,
  options?: { halfDay?: boolean; halfDayPeriod?: HalfDayPeriod; detail?: string }
): string {
  const halfDay = Boolean(options?.halfDay);
  const period = halfDay ? options?.halfDayPeriod ?? "morning" : undefined;
  const customDetail = options?.detail?.trim();
  if (customDetail) {
    if (halfDay && type === "sick" && period) {
      return `${customDetail} (half day · ${HALF_DAY_SCHEDULE[period].label})`;
    }
    return customDetail;
  }
  return defaultLeaveDetail(type, { halfDay, halfDayPeriod: period });
}
