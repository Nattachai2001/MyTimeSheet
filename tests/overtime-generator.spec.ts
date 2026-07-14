import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { AppConfig } from "../src/config/env.js";
import { generateTimesheet } from "../src/timesheet/excel-generator.js";
import { detectOvertimeMapping } from "../src/timesheet/template-mapper.js";
import { cellText } from "../src/timesheet/template-mapper.js";

const templatePath = path.resolve("templates/7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx");
const outputPath = path.resolve("tmp/tests/Skilllane - TimeSheet 202607 - Nattachai Satitchai.xlsx");

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
    templateFilename: "7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx"
  },
  browser: {
    headless: true,
    profileDirectory: "./auth/slack-profile"
  }
};

describe("overtime generation", () => {
  it.skipIf(!existsSync(templatePath))("skips overtime when no entries are provided", async () => {
    await rm(path.dirname(outputPath), { recursive: true, force: true });
    await mkdir(path.dirname(outputPath), { recursive: true });

    const result = await generateTimesheet({
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
      config: testConfig,
      overtimeEntries: []
    });

    expect(result.overtime.applied).toBe(false);
    expect(result.overtime.reason).toBe("no-overtime-entries");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Timesheet - Standard Hours"]);
    expect(detectOvertimeMapping(workbook)).toBeNull();
  });

  it.skipIf(!existsSync(templatePath))("fills the Overtime Hours sheet when entries exist", async () => {
    await rm(path.dirname(outputPath), { recursive: true, force: true });
    await mkdir(path.dirname(outputPath), { recursive: true });

    const result = await generateTimesheet({
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
      config: testConfig,
      overtimeEntries: [
        {
          date: "2026-07-09",
          timeIn: "18:00",
          timeOut: "20:00",
          includedLunchTime: "NO",
          detail: "[Testing]\nRegression overtime"
        }
      ]
    });

    expect(result.overtime.applied).toBe(true);
    expect(result.overtime.filledCount).toBe(1);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);
    const mapping = detectOvertimeMapping(workbook);
    expect(mapping).toBeTruthy();

    const worksheet = workbook.getWorksheet(mapping!.sheetName);
    const row = worksheet!.getRow(mapping!.firstDataRow);
    expect(cellText(row.getCell(mapping!.columns.timeIn))).toBe("18:00");
    expect(cellText(row.getCell(mapping!.columns.timeOut))).toBe("20:00");
    expect(cellText(row.getCell(mapping!.columns.detail))).toContain("Regression overtime");
  });

  it.skipIf(!existsSync(templatePath))("restores overtime sheet styles from template", async () => {
    await rm(path.dirname(outputPath), { recursive: true, force: true });
    await mkdir(path.dirname(outputPath), { recursive: true });

    const longDetail = "[Testing]SKL-19998 - ".repeat(6);
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
      config: testConfig,
      overtimeEntries: [
        {
          date: "2026-07-09",
          timeIn: "18:00",
          timeOut: "20:00",
          includedLunchTime: "NO",
          detail: longDetail
        }
      ]
    });

    const dir = `tmp/test-ot-styles-${Date.now()}`;
    const { execSync } = await import("node:child_process");
    const { mkdirSync, readFileSync, rmSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    execSync(`tar -xf "${outputPath}" -C "${dir}"`, { stdio: "pipe" });
    const styles = readFileSync(`${dir}/xl/styles.xml`, "utf8");
    const sheet2 = readFileSync(`${dir}/xl/worksheets/sheet2.xml`, "utf8");
    rmSync(dir, { recursive: true, force: true });

    const h7 = sheet2.match(/<c[^>]*r="H7"[^>]*s="(\d+)"/)?.[1];
    const d7 = sheet2.match(/<c[^>]*r="D7"[^>]*s="(\d+)"/)?.[1];
    const a6 = sheet2.match(/<c[^>]*r="A6"[^>]*s="(\d+)"/)?.[1];
    const a3 = sheet2.match(/<c[^>]*r="A3"[^>]*s="(\d+)"/)?.[1];

    expect(h7).toBe("63");
    expect(d7).toBe("60");
    expect(a6).toBe("14");
    expect(a3).toBe("7");

    const readXf = (index: string) => {
      const body = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
      let position = 0;
      let xfIndex = 0;
      while (position < body.length) {
        const start = body.indexOf("<xf", position);
        if (start === -1) break;
        const openEnd = body.indexOf(">", start);
        const element =
          body[openEnd - 1] === "/"
            ? body.slice(start, openEnd + 1)
            : body.slice(start, body.indexOf("</xf>", openEnd + 1) + 5);
        if (String(xfIndex) === index) return element;
        xfIndex += 1;
        position = start + element.length;
      }
      return "";
    };

    expect(readXf("7")).toContain('horizontal="right"');
    expect(readXf("14")).toContain('horizontal="center"');
    expect(readXf("60")).toContain('horizontal="center"');
    expect(readXf("63")).toContain('wrapText="1"');
  });
});
