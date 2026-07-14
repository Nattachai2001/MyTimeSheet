import { AppConfig } from "../config/env.js";
import { dateToDisplay, monthDates } from "../shared/date.js";
import { ResolvedWorkDetail } from "../storage/schemas.js";
import { WorkCalendar, isWorkingDate } from "./date-resolver.js";
import { taskCodeForDetail } from "./leave-resolver.js";

export type TimesheetPreviewRowKind = "work" | "missing" | "leave" | "holiday" | "weekend";

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
  source: ResolvedWorkDetail["source"] | "holiday" | "weekend";
  rowKind: TimesheetPreviewRowKind;
  isMissing: boolean;
  isLeave: boolean;
  isMuted: boolean;
}

function previewRowFromDetail(detail: ResolvedWorkDetail, config: AppConfig): TimesheetPreviewRow {
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
    rowKind: isLeave ? "leave" : isMissing ? "missing" : "work",
    isMissing,
    isLeave,
    isMuted: isLeave
  };
}

function previewRowForOffDay(
  date: string,
  rowKind: "holiday" | "weekend",
  config: AppConfig
): TimesheetPreviewRow {
  return {
    date,
    taskCode: config.timesheet.holidayTaskCode,
    role: config.timesheet.role,
    dateDisplay: dateToDisplay(date),
    timeIn: "",
    timeOut: "",
    includedLunch: "",
    hours: "",
    detail: "",
    source: rowKind,
    rowKind,
    isMissing: false,
    isLeave: false,
    isMuted: true
  };
}

export function buildTimesheetPreviewRows(
  details: ResolvedWorkDetail[],
  config: AppConfig
): TimesheetPreviewRow[] {
  return details.map((detail) => previewRowFromDetail(detail, config));
}

export function buildMonthPreviewRows(
  month: string,
  details: ResolvedWorkDetail[],
  calendar: WorkCalendar,
  config: AppConfig
): TimesheetPreviewRow[] {
  const detailsByDate = new Map(details.map((detail) => [detail.date, detail]));

  return monthDates(month).map((date) => {
    if (calendar.holidayDates.includes(date)) {
      return previewRowForOffDay(date, "holiday", config);
    }

    if (!isWorkingDate(date, calendar)) {
      return previewRowForOffDay(date, "weekend", config);
    }

    const detail = detailsByDate.get(date);
    if (!detail) {
      return previewRowFromDetail(
        { date, detail: "[MISSING SUP! DATA]", source: "missing" },
        config
      );
    }

    return previewRowFromDetail(detail, config);
  });
}
