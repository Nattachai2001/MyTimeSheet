import { mkdir } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

import { AppConfig } from "../config/env.js";
import { toFileLockError } from "../shared/file-lock-error.js";
import { replaceFileAtomically } from "../shared/safe-file-replace.js";
import { dateToDisplay, monthDates, parseExcelDisplayDate } from "../shared/date.js";
import { ResolvedWorkDetail } from "../storage/schemas.js";
import { isWorkingDate } from "./date-resolver.js";
import { fillOvertimeSheet } from "./overtime-generator.js";
import { taskCodeForDetail } from "./leave-resolver.js";
import { OvertimeEntry, OvertimeEntryInput, OvertimeFillResult } from "./overtime-types.js";
import { applyDetailRowHeight } from "./row-height.js";
import { applyTimesheetMetadataFonts } from "./timesheet-cell-style.js";
import { cellText, detectTimesheetMapping } from "./template-mapper.js";
import { repairTimesheetStylesFromTemplate } from "./xlsx-style-repair.js";

function isFormulaCell(cell: ExcelJS.Cell): boolean {
  const value = cell.value;
  return Boolean(value && typeof value === "object" && "formula" in value);
}

function setCellUnlessFormula(cell: ExcelJS.Cell, value: ExcelJS.CellValue): void {
  if (isFormulaCell(cell)) return;
  cell.value = value;
}

function clearCellValue(cell: ExcelJS.Cell): void {
  if (cell.value == null || cell.value === "") return;
  cell.value = null;
}

function setTextIfDifferent(cell: ExcelJS.Cell, value: string): void {
  if (isFormulaCell(cell)) return;
  const current = cellText(cell).trim();
  if (current === value.trim()) return;
  cell.value = value;
}

export interface GenerateTimesheetOptions {
  templatePath: string;
  outputPath: string;
  month: string;
  details: ResolvedWorkDetail[];
  config: AppConfig;
  overtimeEntries?: OvertimeEntryInput[];
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
  const prestyledHolidayRows = snapshotPrestyledHolidayRows(
    worksheet,
    mapping,
    rowByDate,
    options.month,
    options.config.timesheet.holidayTaskCode
  );
  const holidayReferenceRow = findHolidayReferenceRow(
    worksheet,
    mapping,
    options.config.timesheet.holidayTaskCode
  );
  const convertedHolidayRows = new Set<number>();
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
    const isFullDayLeave = isLeaveDay && !(detail.halfDay && detail.timeIn && detail.timeOut);
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
        clearCellValue(row.getCell(mapping.columns.timeIn));
        clearCellValue(row.getCell(mapping.columns.timeOut));
        clearCellValue(row.getCell(mapping.columns.includedLunch));
        clearCellValue(row.getCell(mapping.columns.hours));
      }
    } else {
      row.getCell(mapping.columns.timeIn).value = options.config.work.defaultTimeIn;
      row.getCell(mapping.columns.timeOut).value = options.config.work.defaultTimeOut;
      row.getCell(mapping.columns.includedLunch).value = options.config.work.includedLunchTime;

      const hoursCell = row.getCell(mapping.columns.hours);
      if (!isFormulaCell(hoursCell)) {
        hoursCell.value = 8;
        hoursCell.numFmt = "0.00";
      }
    }

    const detailCell = row.getCell(mapping.columns.detail);
    detailCell.value = detail.detail;
    applyDetailRowHeight(worksheet, row, mapping.columns.detail, detail.detail);
    if (detail.source === "missing") {
      missingDates.push(detail.date);
    } else {
      filledDates.push(detail.date);
    }
    if (isFullDayLeave) {
      convertedHolidayRows.add(rowNumber);
    }
    row.commit();
  }

  const calendar = {
    workingDays: options.config.work.workingDays,
    holidayDates: options.config.work.holidayDates,
    excludedDates: options.config.work.excludedDates
  };
  const filledDetailDates = new Set(options.details.map((detail) => detail.date));

  for (const date of monthDates(options.month)) {
    if (filledDetailDates.has(date) || isWorkingDate(date, calendar)) continue;

    const rowNumber = rowByDate.get(date);
    if (!rowNumber) continue;

    const row = worksheet.getRow(rowNumber);
    if (isPrestyledHolidayRow(row, mapping, options.config.timesheet.holidayTaskCode)) {
      const dateCell = row.getCell(mapping.columns.date);
      if (parseExcelDisplayDate(dateCell.value) === date) {
        continue;
      }
      const displayDate = dateToDisplay(date);
      dateCell.value = displayDate;
      row.commit();
      continue;
    }

    setTextIfDifferent(row.getCell(mapping.columns.taskCode), options.config.timesheet.holidayTaskCode);
    setTextIfDifferent(row.getCell(mapping.columns.role), options.config.timesheet.role);
    row.getCell(mapping.columns.date).value = dateToDisplay(date);
    clearCellValue(row.getCell(mapping.columns.timeIn));
    clearCellValue(row.getCell(mapping.columns.timeOut));
    clearCellValue(row.getCell(mapping.columns.includedLunch));
    clearCellValue(row.getCell(mapping.columns.hours));
    clearCellValue(row.getCell(mapping.columns.detail));
    convertedHolidayRows.add(rowNumber);
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
    repairTimesheetStylesFromTemplate(options.templatePath, tempPath, {
      holidayReferenceRow,
      prestyledHolidayRows,
      convertedHolidayRows,
      firstDataRow: mapping.firstDataRow,
      lastDataRow: Math.max(...rowByDate.values()),
      detailColumnNumber: mapping.columns.detail
    });
    await replaceFileAtomically(tempPath, options.outputPath);
  } catch (error) {
    throw toFileLockError(error, options.outputPath);
  }

  return { outputPath: options.outputPath, filledDates, missingDates, overtime };
}

function isPrestyledHolidayRow(
  row: ExcelJS.Row,
  mapping: ReturnType<typeof detectTimesheetMapping>,
  holidayTaskCode: string
): boolean {
  return (
    cellText(row.getCell(mapping.columns.taskCode)).trim().toLowerCase() ===
    holidayTaskCode.trim().toLowerCase()
  );
}

function snapshotPrestyledHolidayRows(
  worksheet: ExcelJS.Worksheet,
  mapping: ReturnType<typeof detectTimesheetMapping>,
  rowByDate: Map<string, number>,
  month: string,
  holidayTaskCode: string
): Set<number> {
  const rows = new Set<number>();
  for (const date of monthDates(month)) {
    const rowNumber = rowByDate.get(date);
    if (!rowNumber) continue;
    const row = worksheet.getRow(rowNumber);
    if (isPrestyledHolidayRow(row, mapping, holidayTaskCode)) {
      rows.add(rowNumber);
    }
  }
  return rows;
}

function findHolidayReferenceRow(
  worksheet: ExcelJS.Worksheet,
  mapping: ReturnType<typeof detectTimesheetMapping>,
  holidayTaskCode: string
): number {
  const normalizedHoliday = holidayTaskCode.trim().toLowerCase();
  for (let rowNumber = mapping.firstDataRow; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const taskText = cellText(worksheet.getRow(rowNumber).getCell(mapping.columns.taskCode))
      .trim()
      .toLowerCase();
    if (!taskText) continue;
    if (taskText === normalizedHoliday || taskText.includes("holiday") || taskText.startsWith("h1")) {
      return rowNumber;
    }
  }
  return mapping.firstDataRow + 3;
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
  applyTimesheetMetadataFonts(worksheet, metadataCells);
}
