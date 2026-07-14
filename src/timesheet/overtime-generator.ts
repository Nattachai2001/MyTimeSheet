import ExcelJS from "exceljs";

import { AppConfig } from "../config/env.js";
import { dateToDisplay } from "../shared/date.js";
import { OvertimeEntryInput, OvertimeFillResult } from "./overtime-types.js";
import { applyDetailRowHeight } from "./row-height.js";
import {
  applyTimesheetMetadataFonts
} from "./timesheet-cell-style.js";
import { cellText, detectOvertimeMapping, normalizeHeader, TimesheetTemplateMapping } from "./template-mapper.js";

export interface FillOvertimeOptions {
  entries: OvertimeEntryInput[];
  config: AppConfig;
  month: string;
}

function sortOvertimeEntries(entries: OvertimeEntryInput[]): OvertimeEntryInput[] {
  return [...entries].sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date);
    if (dateCompare !== 0) return dateCompare;
    return (left.timeIn ?? "").localeCompare(right.timeIn ?? "");
  });
}

export function fillOvertimeSheet(workbook: ExcelJS.Workbook, options: FillOvertimeOptions): OvertimeFillResult {
  const mapping = detectOvertimeMapping(workbook);
  const entries = sortOvertimeEntries(options.entries).filter((entry) => entry.detail.trim());

  if (!entries.length) {
    if (mapping) {
      removeOvertimeSheet(workbook, mapping.sheetName);
    }
    return { applied: false, reason: "no-overtime-entries", filledCount: 0, skippedCount: 0 };
  }

  if (!mapping) {
    return { applied: false, reason: "no-overtime-sheet", filledCount: 0, skippedCount: entries.length };
  }

  const worksheet = workbook.getWorksheet(mapping.sheetName);
  if (!worksheet) {
    return { applied: false, reason: "no-overtime-sheet", filledCount: 0, skippedCount: entries.length };
  }

  updateMetadata(worksheet, mapping.metadataCells, options);
  const dataRows = findOvertimeDataRows(worksheet, mapping);
  if (!dataRows.length) {
    return { applied: false, reason: "no-capacity", filledCount: 0, skippedCount: entries.length };
  }

  const fillCount = Math.min(entries.length, dataRows.length);
  for (let index = 0; index < fillCount; index += 1) {
    fillOvertimeRow(worksheet, dataRows[index], mapping, entries[index], options.config);
  }

  return {
    applied: true,
    filledCount: fillCount,
    skippedCount: Math.max(0, entries.length - fillCount)
  };
}

function removeOvertimeSheet(workbook: ExcelJS.Workbook, sheetName: string): void {
  workbook.removeWorksheet(sheetName);
}

function findOvertimeDataRows(worksheet: ExcelJS.Worksheet, mapping: TimesheetTemplateMapping): number[] {
  let footerRow = worksheet.rowCount + 1;
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < mapping.firstDataRow) return;
    const first = normalizeHeader(cellText(row.getCell(1)));
    const second = normalizeHeader(cellText(row.getCell(2)));
    if (first === "task" && second === "total hours") {
      footerRow = rowNumber;
    }
  });

  const rows: number[] = [];
  for (let rowNumber = mapping.firstDataRow; rowNumber < footerRow; rowNumber += 1) {
    const marker = normalizeHeader(cellText(worksheet.getRow(rowNumber).getCell(1)));
    if (marker === "key tasks accomplished in this period") break;
    rows.push(rowNumber);
  }
  return rows;
}

function fillOvertimeRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  mapping: TimesheetTemplateMapping,
  entry: OvertimeEntryInput,
  config: AppConfig
): void {
  const row = worksheet.getRow(rowNumber);
  row.getCell(mapping.columns.taskCode).value = entry.taskCode ?? config.timesheet.overtimeTaskCode ?? config.timesheet.taskCode;
  row.getCell(mapping.columns.role).value = entry.role ?? config.timesheet.role;
  row.getCell(mapping.columns.date).value = dateToDisplay(entry.date);
  row.getCell(mapping.columns.timeIn).value = entry.timeIn ?? config.timesheet.defaultOvertimeTimeIn;
  row.getCell(mapping.columns.timeOut).value = entry.timeOut ?? config.timesheet.defaultOvertimeTimeOut;
  row.getCell(mapping.columns.includedLunch).value =
    entry.includedLunchTime ?? config.timesheet.defaultOvertimeLunch;

  const detailCell = row.getCell(mapping.columns.detail);
  const detailText = entry.detail.trim();
  detailCell.value = detailText;
  applyDetailRowHeight(worksheet, row, mapping.columns.detail, detailText);
  row.commit();
}

function updateMetadata(
  worksheet: ExcelJS.Worksheet,
  metadataCells: TimesheetTemplateMapping["metadataCells"],
  options: FillOvertimeOptions
): void {
  const date = new Date(`${options.month}-01T00:00:00`);
  const period = `${date.getFullYear()} ${date.toLocaleString("en-US", { month: "short" })}`;
  if (metadataCells.period) worksheet.getCell(metadataCells.period).value = period;
  if (metadataCells.staffName) worksheet.getCell(metadataCells.staffName).value = options.config.timesheet.staffName;
  if (metadataCells.site) worksheet.getCell(metadataCells.site).value = options.config.timesheet.site;
  applyTimesheetMetadataFonts(worksheet, metadataCells);
}
