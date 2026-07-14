import "./exceljs-bootstrap.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

import { AppConfig } from "../config/env.js";
import { replaceFileAtomically } from "../shared/safe-file-replace.js";
import { dateToDisplay, monthDates } from "../shared/date.js";
import { isWorkingDate, WorkCalendar } from "./date-resolver.js";
import {
  applyTemplateHolidayPresentation,
  applyTimesheetMetadataFonts,
  applyWorkRowPresentation,
  snapshotRowPresentation
} from "./timesheet-cell-style.js";
import {
  cellText,
  detectOvertimeMapping,
  detectTimesheetMapping,
  normalizeHeader,
  TimesheetTemplateMapping
} from "./template-mapper.js";
import { repairTimesheetStylesFromTemplate } from "./xlsx-style-repair.js";
import { readWorkbookFromPath, writeWorkbookToPath } from "./workbook-io.js";

export interface BuildMonthlyTemplateOptions {
  masterPath: string;
  outputPath: string;
  month: string;
  config: AppConfig;
}

function clearCellValue(cell: ExcelJS.Cell): void {
  if (cell.value == null || cell.value === "") return;
  cell.value = null;
}

function findHolidayReferenceRow(
  worksheet: ExcelJS.Worksheet,
  mapping: TimesheetTemplateMapping,
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

function findWorkReferenceRow(
  worksheet: ExcelJS.Worksheet,
  mapping: TimesheetTemplateMapping,
  holidayTaskCode: string
): number {
  const normalizedHoliday = holidayTaskCode.trim().toLowerCase();
  for (let rowNumber = mapping.firstDataRow; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const taskText = cellText(worksheet.getRow(rowNumber).getCell(mapping.columns.taskCode))
      .trim()
      .toLowerCase();
    if (taskText && taskText !== normalizedHoliday && !taskText.includes("holiday") && !taskText.startsWith("h1")) {
      return rowNumber;
    }
    const dateText = cellText(worksheet.getRow(rowNumber).getCell(mapping.columns.date)).trim();
    if (dateText && (!taskText || taskText === normalizedHoliday)) {
      return rowNumber;
    }
  }
  return mapping.firstDataRow;
}

function countStandardDataRows(worksheet: ExcelJS.Worksheet, mapping: TimesheetTemplateMapping): number {
  let footerRow = worksheet.rowCount + 1;
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < mapping.firstDataRow) return;
    const first = normalizeHeader(cellText(row.getCell(1)));
    const second = normalizeHeader(cellText(row.getCell(2)));
    if (first === "task" && second === "total hours") {
      footerRow = rowNumber;
    }
  });

  for (let rowNumber = mapping.firstDataRow; rowNumber < footerRow; rowNumber += 1) {
    const marker = normalizeHeader(cellText(worksheet.getRow(rowNumber).getCell(1)));
    if (marker === "key tasks accomplished in this period") {
      footerRow = rowNumber;
      break;
    }
  }

  return footerRow - mapping.firstDataRow;
}

function clearDataRow(row: ExcelJS.Row, mapping: TimesheetTemplateMapping): void {
  for (const column of Object.values(mapping.columns)) {
    clearCellValue(row.getCell(column));
  }
}

function updateMetadata(
  worksheet: ExcelJS.Worksheet,
  metadataCells: TimesheetTemplateMapping["metadataCells"],
  month: string,
  config: AppConfig
): void {
  const date = new Date(`${month}-01T00:00:00`);
  const period = `${date.getFullYear()} ${date.toLocaleString("en-US", { month: "short" })}`;
  if (metadataCells.period) worksheet.getCell(metadataCells.period).value = period;
  if (metadataCells.staffName) worksheet.getCell(metadataCells.staffName).value = config.timesheet.staffName;
  if (metadataCells.site) worksheet.getCell(metadataCells.site).value = config.timesheet.site;
  applyTimesheetMetadataFonts(worksheet, metadataCells);
}

function clearOvertimeDataRows(worksheet: ExcelJS.Worksheet, mapping: TimesheetTemplateMapping): void {
  let footerRow = worksheet.rowCount + 1;
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < mapping.firstDataRow) return;
    const first = normalizeHeader(cellText(row.getCell(1)));
    const second = normalizeHeader(cellText(row.getCell(2)));
    if (first === "task" && second === "total hours") {
      footerRow = rowNumber;
    }
  });

  for (let rowNumber = mapping.firstDataRow; rowNumber < footerRow; rowNumber += 1) {
    const marker = normalizeHeader(cellText(worksheet.getRow(rowNumber).getCell(1)));
    if (marker === "key tasks accomplished in this period") break;
    clearDataRow(worksheet.getRow(rowNumber), mapping);
    worksheet.getRow(rowNumber).commit();
  }
}

function fillHolidayTemplateRow(
  row: ExcelJS.Row,
  mapping: TimesheetTemplateMapping,
  config: AppConfig,
  holidaySnapshot: ReturnType<typeof snapshotRowPresentation>
): void {
  row.getCell(mapping.columns.taskCode).value = config.timesheet.holidayTaskCode;
  row.getCell(mapping.columns.role).value = config.timesheet.role;
  clearCellValue(row.getCell(mapping.columns.timeIn));
  clearCellValue(row.getCell(mapping.columns.timeOut));
  clearCellValue(row.getCell(mapping.columns.includedLunch));
  clearCellValue(row.getCell(mapping.columns.hours));
  clearCellValue(row.getCell(mapping.columns.detail));
  applyTemplateHolidayPresentation(holidaySnapshot, row, mapping.columns);
}

function fillWorkTemplateRow(
  row: ExcelJS.Row,
  mapping: TimesheetTemplateMapping,
  workSnapshot: ReturnType<typeof snapshotRowPresentation>
): void {
  clearCellValue(row.getCell(mapping.columns.taskCode));
  clearCellValue(row.getCell(mapping.columns.role));
  clearCellValue(row.getCell(mapping.columns.timeIn));
  clearCellValue(row.getCell(mapping.columns.timeOut));
  clearCellValue(row.getCell(mapping.columns.includedLunch));
  clearCellValue(row.getCell(mapping.columns.detail));
  clearCellValue(row.getCell(mapping.columns.hours));

  applyWorkRowPresentation(workSnapshot, row, mapping.columns);
}

export async function buildMonthlyTemplate(options: BuildMonthlyTemplateOptions): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  await readWorkbookFromPath(workbook, options.masterPath);

  const mapping = detectTimesheetMapping(workbook);
  const worksheet = workbook.getWorksheet(mapping.sheetName);
  if (!worksheet) throw new Error(`Worksheet not found: ${mapping.sheetName}`);

  const calendar: WorkCalendar = {
    workingDays: options.config.work.workingDays,
    holidayDates: options.config.work.holidayDates,
    excludedDates: options.config.work.excludedDates
  };
  const dates = monthDates(options.month);
  const dataRowCount = countStandardDataRows(worksheet, mapping);
  const holidayReferenceRow = findHolidayReferenceRow(
    worksheet,
    mapping,
    options.config.timesheet.holidayTaskCode
  );
  const workReferenceRow = findWorkReferenceRow(worksheet, mapping, options.config.timesheet.holidayTaskCode);
  const holidaySnapshot = snapshotRowPresentation(worksheet, holidayReferenceRow, mapping.columns);
  const workSnapshot = snapshotRowPresentation(worksheet, workReferenceRow, mapping.columns);
  const prestyledHolidayRows = new Set<number>();

  for (let index = 0; index < dataRowCount; index += 1) {
    const rowNumber = mapping.firstDataRow + index;
    const row = worksheet.getRow(rowNumber);

    if (index >= dates.length) {
      clearDataRow(row, mapping);
      row.commit();
      continue;
    }

    const date = dates[index];
    row.getCell(mapping.columns.date).value = dateToDisplay(date);

    if (!isWorkingDate(date, calendar)) {
      fillHolidayTemplateRow(row, mapping, options.config, holidaySnapshot);
      prestyledHolidayRows.add(rowNumber);
    } else {
      fillWorkTemplateRow(row, mapping, workSnapshot);
    }
    row.commit();
  }

  updateMetadata(worksheet, mapping.metadataCells, options.month, options.config);

  const overtimeMapping = detectOvertimeMapping(workbook);
  if (overtimeMapping) {
    const overtimeSheet = workbook.getWorksheet(overtimeMapping.sheetName);
    if (overtimeSheet) {
      clearOvertimeDataRows(overtimeSheet, overtimeMapping);
      updateMetadata(overtimeSheet, overtimeMapping.metadataCells, options.month, options.config);
    }
  }

  await mkdir(path.dirname(options.outputPath), { recursive: true });
  const tempPath = path.join(
    path.dirname(options.outputPath),
    `.${path.basename(options.outputPath)}.${process.pid}.${Date.now()}.tmp`
  );

  await writeWorkbookToPath(workbook, tempPath);
  const lastDataRow = mapping.firstDataRow + dates.length - 1;
  repairTimesheetStylesFromTemplate(options.masterPath, tempPath, {
    holidayReferenceRow,
    workReferenceRow,
    prestyledHolidayRows,
    convertedHolidayRows: new Set(),
    firstDataRow: mapping.firstDataRow,
    lastDataRow,
    detailColumnNumber: mapping.columns.detail
  });
  await replaceFileAtomically(tempPath, options.outputPath);
}
