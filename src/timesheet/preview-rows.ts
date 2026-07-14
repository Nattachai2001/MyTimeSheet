import { AppConfig } from "../config/env.js";
import { dateToDisplay } from "../shared/date.js";
import { ResolvedWorkDetail } from "../storage/schemas.js";
import { taskCodeForDetail } from "./leave-resolver.js";

export interface TimesheetPreviewRow {
  date: string;
  taskCode: string;
  role: string;
  dateDisplay: string;
  timeIn: string;
  timeOut: string;
  includedLunch: string;
  hours: string;
  detail: string;
  source: ResolvedWorkDetail["source"];
  isMissing: boolean;
  isLeave: boolean;
}

export function buildTimesheetPreviewRows(
  details: ResolvedWorkDetail[],
  config: AppConfig
): TimesheetPreviewRow[] {
  return details.map((detail) => {
    const isLeave = detail.source === "annual-leave" || detail.source === "sick-leave";
    const isMissing = detail.source === "missing";

    return {
      date: detail.date,
      taskCode: taskCodeForDetail(config, detail.source),
      role: config.timesheet.role,
      dateDisplay: dateToDisplay(detail.date),
      timeIn: isLeave
        ? detail.halfDay && detail.timeIn
          ? detail.timeIn
          : ""
        : config.work.defaultTimeIn,
      timeOut: isLeave
        ? detail.halfDay && detail.timeOut
          ? detail.timeOut
          : ""
        : config.work.defaultTimeOut,
      includedLunch: isLeave ? "" : config.work.includedLunchTime,
      hours: isLeave
        ? detail.halfDay && detail.hours != null
          ? detail.hours.toFixed(2)
          : ""
        : "8.00",
      detail: detail.detail,
      source: detail.source,
      isMissing,
      isLeave
    };
  });
}
