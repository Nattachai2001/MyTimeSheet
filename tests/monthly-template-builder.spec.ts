import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { AppConfig } from "../src/config/env.js";
import { parseExcelDisplayDate } from "../src/shared/date.js";
import { buildMonthlyTemplate } from "../src/timesheet/monthly-template-builder.js";
import { ensureTemplateForMonth } from "../src/timesheet/ensure-template.js";
import { templateFilenameForMonth } from "../src/timesheet/template-filename.js";
import { detectTimesheetMapping, cellText } from "../src/timesheet/template-mapper.js";

const masterPath = path.resolve("templates/7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx");
const tmpRoot = path.resolve("tmp/tests/monthly-template-builder");

function cellStyleIndex(filePath: string, ref: string): string | undefined {
  const dir = path.join(tmpRoot, `style-${ref}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  execSync(`tar -xf "${filePath}" -C "${dir}"`, { stdio: "pipe" });
  const sheet = readFileSync(path.join(dir, "xl/worksheets/sheet1.xml"), "utf8");
  rmSync(dir, { recursive: true, force: true });
  return sheet.match(new RegExp(`<c[^>]*r="${ref}"[^>]*s="(\\d+)"`))?.[1];
}

const testConfig: AppConfig = {
  slack: {
    workspaceUrl: "https://example.slack.com",
    channelUrl: "https://example.slack.com/archives/C123",
    displayName: "Test User",
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
    staffName: "Test Staff",
    site: "Test Site",
    taskCode: "W1 - Test Execution",
    holidayTaskCode: "H1 - Holiday",
    annualLeaveTaskCode: "L1 - Annual Leave",
    sickLeaveTaskCode: "L2 - Sick Leave",
    role: "Junior QA Consult",
    defaultOvertimeTimeIn: "18:00",
    defaultOvertimeTimeOut: "20:00",
    defaultOvertimeLunch: "NO",
    templateFilename: "7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx"
  },
  browser: {
    headless: true,
    profileDirectory: "./auth/slack-profile"
  }
};

describe("buildMonthlyTemplate", () => {
  it.skipIf(!existsSync(masterPath))("writes month-specific dates and clears extra rows for February", async () => {
    await rm(tmpRoot, { recursive: true, force: true });
    await mkdir(tmpRoot, { recursive: true });

    const outputPath = path.join(tmpRoot, templateFilenameForMonth("2027-02"));
    await buildMonthlyTemplate({
      masterPath,
      outputPath,
      month: "2027-02",
      config: testConfig
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);
    const mapping = detectTimesheetMapping(workbook);
    const worksheet = workbook.getWorksheet(mapping.sheetName)!;

    const datedRows: string[] = [];
    for (let index = 0; index < 31; index += 1) {
      const row = worksheet.getRow(mapping.firstDataRow + index);
      const parsed = parseExcelDisplayDate(row.getCell(mapping.columns.date).value);
      if (parsed) datedRows.push(parsed);
    }

    expect(datedRows).toHaveLength(28);
    expect(datedRows[0]).toBe("2027-02-01");
    expect(datedRows[27]).toBe("2027-02-28");

    const extraRow = worksheet.getRow(mapping.firstDataRow + 28);
    expect(cellText(extraRow.getCell(mapping.columns.date)).trim()).toBe("");
  });

  it.skipIf(!existsSync(masterPath))("marks weekends as holiday rows", async () => {
    await rm(tmpRoot, { recursive: true, force: true });
    await mkdir(tmpRoot, { recursive: true });

    const outputPath = path.join(tmpRoot, templateFilenameForMonth("2027-03"));
    await buildMonthlyTemplate({
      masterPath,
      outputPath,
      month: "2027-03",
      config: testConfig
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);
    const mapping = detectTimesheetMapping(workbook);
    const worksheet = workbook.getWorksheet(mapping.sheetName)!;

    const saturdayRow = worksheet
      .getRows(mapping.firstDataRow, 31)!
      .find((row) => parseExcelDisplayDate(row.getCell(mapping.columns.date).value) === "2027-03-06");

    expect(saturdayRow?.getCell(mapping.columns.taskCode).text).toBe("H1 - Holiday");
  });

  it.skipIf(!existsSync(masterPath))(
    "styles weekday rows as work and weekends as holiday when built from July master",
    async () => {
      await rm(tmpRoot, { recursive: true, force: true });
      await mkdir(tmpRoot, { recursive: true });

      const outputPath = path.join(tmpRoot, templateFilenameForMonth("2027-02"));
      await buildMonthlyTemplate({
        masterPath,
        outputPath,
        month: "2027-02",
        config: testConfig
      });

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(masterPath);
      const mapping = detectTimesheetMapping(workbook);
      const holidayReferenceRow = mapping.firstDataRow + 3;
      const workReferenceRow = mapping.firstDataRow;

      const thursdayHoursStyle = cellStyleIndex(outputPath, `G${mapping.firstDataRow + 3}`);
      const saturdayHoursStyle = cellStyleIndex(outputPath, `G${mapping.firstDataRow + 5}`);
      const masterWorkHoursStyle = cellStyleIndex(masterPath, `G${workReferenceRow}`);
      const masterHolidayHoursStyle = cellStyleIndex(masterPath, `G${holidayReferenceRow}`);

      expect(thursdayHoursStyle).toBe(masterWorkHoursStyle);
      expect(saturdayHoursStyle).toBe(masterHolidayHoursStyle);
      expect(thursdayHoursStyle).not.toBe(saturdayHoursStyle);
    }
  );
});

describe("ensureTemplateForMonth", () => {
  it.skipIf(!existsSync(masterPath))("creates once and reuses cached template", async () => {
    await rm(tmpRoot, { recursive: true, force: true });
    await mkdir(tmpRoot, { recursive: true });

    const first = await ensureTemplateForMonth({
      month: "2027-04",
      config: testConfig,
      templateFolder: tmpRoot
    });
    expect(first.created).toBe(true);

    const mtimeMs = (await stat(first.templatePath)).mtimeMs;

    const second = await ensureTemplateForMonth({
      month: "2027-04",
      config: testConfig,
      templateFolder: tmpRoot
    });
    expect(second.created).toBe(false);
    expect(second.templatePath).toBe(first.templatePath);
    expect((await stat(second.templatePath)).mtimeMs).toBe(mtimeMs);
  });
});
