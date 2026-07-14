import { mkdir } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

import { AppConfig } from "../config/env.js";
import { toFileLockError } from "../shared/file-lock-error.js";
import { replaceFileAtomically } from "../shared/safe-file-replace.js";
import { dateToDisplay, parseExcelDisplayDate } from "../shared/date.js";
import { ResolvedWorkDetail } from "../storage/schemas.js";
import { fillOvertimeSheet } from "./overtime-generator.js";
import { taskCodeForDetail } from "./leave-resolver.js";
import { OvertimeEntry, OvertimeFillResult } from "./overtime-types.js";
import { applyDetailRowHeight } from "./row-height.js";
import { detectTimesheetMapping } from "./template-mapper.js";

export interface GenerateTimesheetOptions {
  templatePath: string;
  outputPath: string;
  month: string;
  details: ResolvedWorkDetail[];
  config: AppConfig;
  overtimeEntries?: OvertimeEntry[];
}

export interface GenerateTimesheetResult {
  outputPath: string;
  filledDates: string[];
  missingDates: string[];
  overtime: OvertimeFillResult;
}

export async function generateTimesheet(
  options: GenerateTimesheetOptions
): Promise<GenerateTimesheetResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(options.templatePath);
  } catch (error) {
    throw toFileLockError(error, options.templatePath);
  }
  const mapping = detectTimesheetMapping(workbook);
  const worksheet = workbook.getWorksheet(mapping.sheetName);
  if (!worksheet) throw new Error(`Worksheet not found: ${mapping.sheetName}`);

  updateMetadata(worksheet, mapping.metadataCells, options);

  const rowByDate = mapRowsByDate(worksheet, mapping.columns.date, mapping.firstDataRow);
  const filledDates: string[] = [];
  const missingDates: string[] = [];

  for (const detail of options.details) {
    const rowNumber = rowByDate.get(detail.date);
    if (!rowNumber) {
      missingDates.push(detail.date);
      continue;
    }

    const row = worksheet.getRow(rowNumber);
    const isLeaveDay = detail.source === "annual-leave" || detail.source === "sick-leave";
    row.getCell(mapping.columns.taskCode).value = taskCodeForDetail(options.config, detail.source);
    row.getCell(mapping.columns.role).value = options.config.timesheet.role;
    row.getCell(mapping.columns.date).value = dateToDisplay(detail.date);

    if (isLeaveDay) {
      if (detail.halfDay && detail.timeIn && detail.timeOut) {
        row.getCell(mapping.columns.timeIn).value = detail.timeIn;
        row.getCell(mapping.columns.timeOut).value = detail.timeOut;
        row.getCell(mapping.columns.includedLunch).value = detail.includedLunch ?? null;
        const hoursCell = row.getCell(mapping.columns.hours);
        hoursCell.value = detail.hours ?? null;
        if (detail.hours != null) hoursCell.numFmt = "0.00";
      } else {
        row.getCell(mapping.columns.timeIn).value = null;
        row.getCell(mapping.columns.timeOut).value = null;
        row.getCell(mapping.columns.includedLunch).value = null;
        row.getCell(mapping.columns.hours).value = null;
      }
    } else {
      row.getCell(mapping.columns.timeIn).value = options.config.work.defaultTimeIn;
      row.getCell(mapping.columns.timeOut).value = options.config.work.defaultTimeOut;
      row.getCell(mapping.columns.includedLunch).value = options.config.work.includedLunchTime;

      const hoursCell = row.getCell(mapping.columns.hours);
      if (!hoursCell.value || typeof hoursCell.value !== "object") {
        hoursCell.value = 8;
        hoursCell.numFmt = "0.00";
      }
    }

    const detailCell = row.getCell(mapping.columns.detail);
    detailCell.value = detail.detail;
    detailCell.alignment = { ...(detailCell.alignment ?? {}), wrapText: true, vertical: "top" };
    applyDetailRowHeight(worksheet, row, mapping.columns.detail, detail.detail);
    if (detail.source === "missing") {
      detailCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFF00" }
      };
      missingDates.push(detail.date);
    } else {
      filledDates.push(detail.date);
    }
    row.commit();
  }

  const overtime = fillOvertimeSheet(workbook, {
    entries: options.overtimeEntries ?? [],
    config: options.config,
    month: options.month
  });

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  const tempPath = path.join(
    path.dirname(options.outputPath),
    `.${path.basename(options.outputPath)}.${process.pid}.${Date.now()}.tmp`
  );
  try {
    await workbook.xlsx.writeFile(tempPath);
    await replaceFileAtomically(tempPath, options.outputPath);
  } catch (error) {
    throw toFileLockError(error, options.outputPath);
  }

  return { outputPath: options.outputPath, filledDates, missingDates, overtime };
}

function mapRowsByDate(
  worksheet: ExcelJS.Worksheet,
  dateColumn: number,
  firstDataRow: number
): Map<string, number> {
  const result = new Map<string, number>();
  for (let rowNumber = firstDataRow; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const cell = worksheet.getRow(rowNumber).getCell(dateColumn);
    const parsed = parseExcelDisplayDate(cell.value);
    if (parsed) result.set(parsed, rowNumber);
  }
  return result;
}

function updateMetadata(
  worksheet: ExcelJS.Worksheet,
  metadataCells: ReturnType<typeof detectTimesheetMapping>["metadataCells"],
  options: GenerateTimesheetOptions
): void {
  const date = new Date(`${options.month}-01T00:00:00`);
  const period = `${date.getFullYear()} ${date.toLocaleString("en-US", { month: "short" })}`;
  if (metadataCells.period) worksheet.getCell(metadataCells.period).value = period;
  if (metadataCells.staffName) worksheet.getCell(metadataCells.staffName).value = options.config.timesheet.staffName;
  if (metadataCells.site) worksheet.getCell(metadataCells.site).value = options.config.timesheet.site;
}
