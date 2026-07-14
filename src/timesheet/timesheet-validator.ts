import ExcelJS from "exceljs";

import { AppConfig } from "../config/env.js";
import { monthDates, parseExcelDisplayDate } from "../shared/date.js";
import { isWorkingDate, WorkCalendar } from "./date-resolver.js";
import { detectTimesheetMapping } from "./template-mapper.js";

function isLeaveTaskCode(taskCode: string, config: AppConfig): boolean {
  const normalized = taskCode.trim().toLowerCase();
  return (
    normalized === config.timesheet.annualLeaveTaskCode.trim().toLowerCase() ||
    normalized === config.timesheet.sickLeaveTaskCode.trim().toLowerCase()
  );
}

export interface ValidationSummary {
  expectedWorkingDays: number;
  completedDays: number;
  missingDays: string[];
  workbookOpens: boolean;
}

export async function validateWorkbook(
  workbookPath: string,
  month: string,
  config: AppConfig
): Promise<ValidationSummary> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const mapping = detectTimesheetMapping(workbook);
  const worksheet = workbook.getWorksheet(mapping.sheetName);
  if (!worksheet) throw new Error(`Worksheet not found: ${mapping.sheetName}`);

  const calendar: WorkCalendar = {
    workingDays: config.work.workingDays,
    holidayDates: config.work.holidayDates,
    excludedDates: config.work.excludedDates
  };
  const expected = monthDates(month).filter((date) => isWorkingDate(date, calendar));
  const completed = new Set<string>();
  const missingDays: string[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < mapping.firstDataRow) return;
    const date = parseExcelDisplayDate(row.getCell(mapping.columns.date).value);
    if (!date || !expected.includes(date)) return;

    const detail = row.getCell(mapping.columns.detail).text.trim();
    const timeIn = row.getCell(mapping.columns.timeIn).text.trim();
    const timeOut = row.getCell(mapping.columns.timeOut).text.trim();
    const taskCode = row.getCell(mapping.columns.taskCode).text.trim();
    const isLeaveDay = isLeaveTaskCode(taskCode, config);
    const isCompleteWorkDay =
      detail &&
      detail !== "[MISSING SUP! DATA]" &&
      timeIn === config.work.defaultTimeIn &&
      timeOut === config.work.defaultTimeOut;
    const isCompleteLeaveDay =
      isLeaveDay &&
      detail &&
      detail !== "[MISSING SUP! DATA]" &&
      ((!timeIn && !timeOut) ||
        (timeIn === "09:00" && timeOut === "12:00") ||
        (timeIn === "13:00" && timeOut === "18:00"));

    if (isCompleteWorkDay || isCompleteLeaveDay) {
      completed.add(date);
    } else {
      missingDays.push(date);
    }
  });

  return {
    expectedWorkingDays: expected.length,
    completedDays: completed.size,
    missingDays,
    workbookOpens: true
  };
}
