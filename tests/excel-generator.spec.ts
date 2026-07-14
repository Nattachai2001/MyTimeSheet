import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { AppConfig } from "../src/config/env.js";
import { generateTimesheet } from "../src/timesheet/excel-generator.js";
import { detectTimesheetMapping } from "../src/timesheet/template-mapper.js";

const templatePath = path.resolve("templates/7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx");
const outputPath = path.resolve("tmp/tests/Jul 2026 - TimeSheet - Nattachai.xlsx");

describe("generateTimesheet", () => {
  it.skipIf(!existsSync(templatePath))("fills a copied template and keeps formulas/merges readable", async () => {
    await rm(path.dirname(outputPath), { recursive: true, force: true });
    await mkdir(path.dirname(outputPath), { recursive: true });

    await generateTimesheet({
      templatePath,
      outputPath,
      month: "2026-07",
      details: [
        {
          date: "2026-07-01",
          detail: "[Meeting]\nSprint planning",
          source: "same-report-today"
        }
      ],
      config: testConfig
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);
    const mapping = detectTimesheetMapping(workbook);
    const worksheet = workbook.getWorksheet(mapping.sheetName);
    expect(worksheet).toBeTruthy();

    const row = worksheet!
      .getRows(mapping.firstDataRow, worksheet!.rowCount - mapping.firstDataRow + 1)!
      .find((candidate) => candidate.getCell(mapping.columns.date).text.includes("1/7/2026"));

    expect(row?.getCell(mapping.columns.timeIn).text).toBe("09:00");
    expect(row?.getCell(mapping.columns.timeOut).text).toBe("18:00");
    expect(row?.getCell(mapping.columns.detail).text).toContain("Sprint planning");
    expect(row?.height).toBeGreaterThanOrEqual(30);
    expect((worksheet!.model as { merges?: string[] }).merges?.length ?? 0).toBeGreaterThan(0);
  });

  it.skipIf(!existsSync(templatePath))("fills half-day sick leave morning times", async () => {
    await rm(path.dirname(outputPath), { recursive: true, force: true });
    await mkdir(path.dirname(outputPath), { recursive: true });

    await generateTimesheet({
      templatePath,
      outputPath,
      month: "2026-07",
      details: [
        {
          date: "2026-07-02",
          detail: "Sick leave (half day · morning 09:00–12:00)",
          source: "sick-leave",
          halfDay: true,
          halfDayPeriod: "morning",
          timeIn: "09:00",
          timeOut: "12:00",
          hours: 3,
          includedLunch: null
        }
      ],
      config: testConfig
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);
    const mapping = detectTimesheetMapping(workbook);
    const worksheet = workbook.getWorksheet(mapping.sheetName);
    const row = worksheet!
      .getRows(mapping.firstDataRow, worksheet!.rowCount - mapping.firstDataRow + 1)!
      .find((candidate) => candidate.getCell(mapping.columns.date).text.includes("2/7/2026"));

    expect(row?.getCell(mapping.columns.timeIn).text).toBe("09:00");
    expect(row?.getCell(mapping.columns.timeOut).text).toBe("12:00");
    expect(Number(row?.getCell(mapping.columns.hours).value)).toBe(3);
    expect(row?.getCell(mapping.columns.detail).text).toContain("morning");
  });

  it.skipIf(!existsSync(templatePath))("clears hours formulas on converted weekday holidays", async () => {
    await rm(path.dirname(outputPath), { recursive: true, force: true });
    await mkdir(path.dirname(outputPath), { recursive: true });

    const holidayConfig: AppConfig = {
      ...testConfig,
      work: {
        ...testConfig.work,
        holidayDates: ["2026-07-16"]
      }
    };

    await generateTimesheet({
      templatePath,
      outputPath,
      month: "2026-07",
      details: [],
      config: holidayConfig
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);
    const mapping = detectTimesheetMapping(workbook);
    const worksheet = workbook.getWorksheet(mapping.sheetName);
    const row = worksheet!
      .getRows(mapping.firstDataRow, worksheet!.rowCount - mapping.firstDataRow + 1)!
      .find((candidate) => candidate.getCell(mapping.columns.date).text.includes("16/7/2026"));

    expect(row?.getCell(mapping.columns.taskCode).text).toContain("Holiday");
    expect(row?.getCell(mapping.columns.timeIn).text).toBe("");
    expect(row?.getCell(mapping.columns.timeOut).text).toBe("");
    expect(row?.getCell(mapping.columns.hours).text).toBe("");
    expect(row?.getCell(mapping.columns.hours).formula).toBeFalsy();
  });

  it.skipIf(!existsSync(templatePath))("leaves time cells empty for full leave days", async () => {
    await rm(path.dirname(outputPath), { recursive: true, force: true });
    await mkdir(path.dirname(outputPath), { recursive: true });

    await generateTimesheet({
      templatePath,
      outputPath,
      month: "2026-07",
      details: [
        {
          date: "2026-07-02",
          detail: "Sick leave",
          source: "sick-leave"
        }
      ],
      config: testConfig
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);
    const mapping = detectTimesheetMapping(workbook);
    const worksheet = workbook.getWorksheet(mapping.sheetName);
    const row = worksheet!
      .getRows(mapping.firstDataRow, worksheet!.rowCount - mapping.firstDataRow + 1)!
      .find((candidate) => candidate.getCell(mapping.columns.date).text.includes("2/7/2026"));

    expect(row?.getCell(mapping.columns.timeIn).text).toBe("");
    expect(row?.getCell(mapping.columns.timeOut).text).toBe("");
    expect(row?.getCell(mapping.columns.hours).text).toBe("");
    expect(row?.getCell(mapping.columns.detail).text).toContain("Sick leave");
  });
});

const testConfig: AppConfig = {
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
    holidayDates: [],
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
    templateFilename: "7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx",
    outputFilename: "Jul 2026 - TimeSheet - Nattachai.xlsx"
  },
  browser: {
    headless: true,
    profileDirectory: "./auth/slack-profile"
  }
};
