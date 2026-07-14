import { describe, expect, it } from "vitest";

import { AppConfig } from "../src/config/env.js";
import {
  buildMonthPreviewRows,
  buildTimesheetPreviewRows
} from "../src/timesheet/preview-rows.js";
import { WorkCalendar } from "../src/timesheet/date-resolver.js";

const config: AppConfig = {
  slack: {
    workspaceUrl: "https://example.slack.com",
    channelUrl: "https://example.slack.com/archives/C123",
    displayName: "Pluem",
    supBotName: "Sup!"
  },
  work: {
    timezone: "Asia/Bangkok",
    defaultTimeIn: "09:00",
    defaultTimeOut: "18:00",
    includedLunchTime: "YES",
    workingDays: [1, 2, 3, 4, 5],
    holidayDates: ["2026-07-10"],
    extraHolidayDates: [],
    disabledThaiHolidaySlugs: [],
    excludedDates: []
  },
  storage: { rootDirectory: "./data" },
  timesheet: {
    staffName: "Nattachai Satitchai",
    site: "Skilllane",
    taskCode: "W1 - Test Execution",
    holidayTaskCode: "H1 - Holiday",
    annualLeaveTaskCode: "L1 - Annual Leave",
    sickLeaveTaskCode: "L2 - Sick Leave",
    role: "Junior QA Consult",
    defaultOvertimeTimeIn: "18:00",
    defaultOvertimeTimeOut: "20:00",
    defaultOvertimeLunch: "NO",
    templateFilename: "template.xlsx",
    outputFilename: "output.xlsx"
  },
  browser: {
    headless: true,
    profileDirectory: "./auth/slack-profile"
  }
};

const calendar: WorkCalendar = {
  workingDays: config.work.workingDays,
  holidayDates: config.work.holidayDates,
  excludedDates: config.work.excludedDates
};

describe("buildTimesheetPreviewRows", () => {
  it("mirrors workbook values for work and leave days", () => {
    const rows = buildTimesheetPreviewRows(
      [
        { date: "2026-06-30", detail: "[Meeting]\nQA planning", source: "same-report-today" },
        { date: "2026-07-01", detail: "[MISSING SUP! DATA]", source: "missing" },
        { date: "2026-07-02", detail: "Sick leave", source: "sick-leave" }
      ],
      config
    );

    expect(rows[0]).toMatchObject({
      taskCode: "W1 - Test Execution",
      timeIn: "09:00",
      hours: "8.00",
      dateDisplay: "30/6/2026",
      rowKind: "work",
      isMuted: false
    });
    expect(rows[1]).toMatchObject({ isMissing: true, rowKind: "missing", isMuted: false });
    expect(rows[2]).toMatchObject({
      taskCode: "L2 - Sick Leave",
      timeIn: "",
      hours: "",
      isLeave: true,
      rowKind: "leave",
      isMuted: true
    });
  });
});

describe("buildMonthPreviewRows", () => {
  it("includes muted rows for holidays, weekends, and leave days", () => {
    const rows = buildMonthPreviewRows(
      "2026-07",
      [
        { date: "2026-07-09", detail: "[Meeting]\nQA planning", source: "same-report-today" },
        { date: "2026-07-13", detail: "Annual leave", source: "annual-leave" }
      ],
      calendar,
      config
    );

    const holiday = rows.find((row) => row.date === "2026-07-10");
    const weekend = rows.find((row) => row.date === "2026-07-11");
    const leave = rows.find((row) => row.date === "2026-07-13");
    const work = rows.find((row) => row.date === "2026-07-09");

    expect(holiday).toMatchObject({
      rowKind: "holiday",
      taskCode: "H1 - Holiday",
      detail: "",
      isMuted: true
    });
    expect(weekend).toMatchObject({
      rowKind: "weekend",
      taskCode: "H1 - Holiday",
      role: "Junior QA Consult",
      detail: "",
      isMuted: true
    });
    expect(leave).toMatchObject({
      rowKind: "leave",
      isLeave: true,
      isMuted: true
    });
    expect(work).toMatchObject({
      rowKind: "work",
      isMuted: false
    });
    expect(rows).toHaveLength(31);
  });
});
