import { AppConfig } from "../config/env.js";
import { DailyRecordRepository } from "../storage/daily-record-repository.js";
import { LeaveRecordRepository } from "../storage/leave-record-repository.js";
import { SupDailyRecord, ResolvedWorkDetail } from "../storage/schemas.js";
import {
  formatLeaveDetail,
  halfDaySchedule,
  LeaveEntry,
  resolveHalfDayPeriod
} from "./leave-types.js";
import { resolveMonthlyWorkDetails, WorkCalendar } from "./date-resolver.js";

export function applyLeaveEntries(details: ResolvedWorkDetail[], leaveEntries: LeaveEntry[]): ResolvedWorkDetail[] {
  const byDate = new Map(leaveEntries.map((entry) => [entry.date, entry]));
  return details.map((detail) => {
    const leave = byDate.get(detail.date);
    if (!leave) return detail;

    const halfDay = leave.type === "sick" && Boolean(leave.halfDay);
    const halfDayPeriod = halfDay ? resolveHalfDayPeriod(leave) : undefined;
    const schedule = halfDayPeriod ? halfDaySchedule(halfDayPeriod) : undefined;

    return {
      date: detail.date,
      detail: formatLeaveDetail(leave.type, {
        halfDay,
        halfDayPeriod,
        detail: leave.detail
      }),
      source: leave.type === "annual" ? "annual-leave" : "sick-leave",
      halfDay: halfDay || undefined,
      halfDayPeriod,
      timeIn: schedule?.timeIn,
      timeOut: schedule?.timeOut,
      hours: schedule?.hours,
      includedLunch: schedule ? null : undefined
    };
  });
}

export function resolveMonthTimesheetDetails(
  month: string,
  records: SupDailyRecord[],
  calendar: WorkCalendar,
  leaveEntries: LeaveEntry[]
): ResolvedWorkDetail[] {
  return applyLeaveEntries(resolveMonthlyWorkDetails(month, records, calendar), leaveEntries);
}

export async function loadMonthTimesheetDetails(
  month: string,
  storageRoot: string,
  calendar: WorkCalendar
): Promise<ResolvedWorkDetail[]> {
  const records = await new DailyRecordRepository(storageRoot).readMonth(month);
  const leaveEntries = await new LeaveRecordRepository(storageRoot).readMonth(month);
  return resolveMonthTimesheetDetails(month, records, calendar, leaveEntries);
}

export function taskCodeForDetail(config: AppConfig, source: ResolvedWorkDetail["source"]): string {
  if (source === "annual-leave") return config.timesheet.annualLeaveTaskCode;
  if (source === "sick-leave") return config.timesheet.sickLeaveTaskCode;
  return config.timesheet.taskCode;
}
