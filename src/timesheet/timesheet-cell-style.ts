import ExcelJS from "exceljs";

import type { TimesheetTemplateMapping } from "./template-mapper.js";

export const TIMESHEET_FONT: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 11
};

const GRID_LINE: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };

const WORK_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFFFF" }
};

const HOURS_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFDE9D9" }
};

export interface CellPresentation {
  border?: Partial<ExcelJS.Borders>;
  alignment?: Partial<ExcelJS.Alignment>;
  fill?: ExcelJS.FillPattern;
  numFmt?: string;
}

export interface RowPresentationSnapshot {
  cells: Record<keyof TimesheetTemplateMapping["columns"], CellPresentation>;
}

function cloneBorder(border?: Partial<ExcelJS.Border>): ExcelJS.Border | undefined {
  if (!border?.style) return undefined;
  return {
    style: border.style,
    color: border.color ? { ...border.color } : { argb: "FF000000" }
  };
}

function cloneBorders(borders?: Partial<ExcelJS.Borders>): Partial<ExcelJS.Borders> | undefined {
  if (!borders) return undefined;
  const cloned: Partial<ExcelJS.Borders> = {};
  const top = cloneBorder(borders.top);
  const left = cloneBorder(borders.left);
  const bottom = cloneBorder(borders.bottom);
  const right = cloneBorder(borders.right);
  if (top) cloned.top = top;
  if (left) cloned.left = left;
  if (bottom) cloned.bottom = bottom;
  if (right) cloned.right = right;
  return Object.keys(cloned).length > 0 ? cloned : undefined;
}

function cloneFill(fill: ExcelJS.FillPattern): ExcelJS.FillPattern {
  return {
    type: fill.type,
    pattern: fill.pattern,
    fgColor: fill.fgColor ? { ...fill.fgColor } : undefined,
    bgColor: fill.bgColor ? { ...fill.bgColor } : undefined
  };
}

function readCellFill(cell: ExcelJS.Cell): ExcelJS.FillPattern | undefined {
  const fill = cell.fill;
  if (!fill || fill.type !== "pattern" || !fill.pattern) return undefined;
  return cloneFill(fill as ExcelJS.FillPattern);
}

function defaultBorders(): Partial<ExcelJS.Borders> {
  return {
    top: GRID_LINE,
    left: GRID_LINE,
    bottom: GRID_LINE,
    right: GRID_LINE
  };
}

function fillForWorkColumn(columnKey: keyof TimesheetTemplateMapping["columns"]): ExcelJS.FillPattern {
  if (columnKey === "hours") return HOURS_FILL;
  return WORK_FILL;
}

function applyCellPresentation(
  target: ExcelJS.Cell,
  presentation: CellPresentation,
  fill: ExcelJS.FillPattern,
  options?: {
    alignmentOverride?: Partial<ExcelJS.Alignment>;
  }
): void {
  const borders = cloneBorders(presentation.border) ?? defaultBorders();
  const alignment = options?.alignmentOverride ?? presentation.alignment;

  target.style = {
    font: { ...(target.font ?? {}), ...TIMESHEET_FONT },
    border: borders,
    alignment: alignment ? { ...alignment } : undefined,
    fill: cloneFill(fill),
    numFmt: presentation.numFmt ?? target.numFmt
  };
}

export function snapshotRowPresentation(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columns: TimesheetTemplateMapping["columns"]
): RowPresentationSnapshot {
  const row = worksheet.getRow(rowNumber);
  const cells = {} as RowPresentationSnapshot["cells"];

  for (const [key, column] of Object.entries(columns) as Array<
    [keyof TimesheetTemplateMapping["columns"], number]
  >) {
    const cell = row.getCell(column);
    cells[key] = {
      border: cloneBorders(cell.border),
      alignment: cell.alignment ? { ...cell.alignment } : undefined,
      fill: readCellFill(cell),
      numFmt: cell.numFmt
    };
  }

  return { cells };
}

export function applyTemplateHolidayPresentation(
  holidaySnapshot: RowPresentationSnapshot,
  targetRow: ExcelJS.Row,
  columns: TimesheetTemplateMapping["columns"],
  options?: { wrapDetail?: boolean }
): void {
  for (const [key, column] of Object.entries(columns) as Array<
    [keyof TimesheetTemplateMapping["columns"], number]
  >) {
    const presentation = holidaySnapshot.cells[key];
    const target = targetRow.getCell(column);
    const fill = presentation.fill ?? fillForWorkColumn(key);
    const alignmentOverride =
      key === "detail" && options?.wrapDetail
        ? { ...(presentation.alignment ?? {}), wrapText: true, vertical: "top" as const }
        : presentation.alignment;

    applyCellPresentation(target, presentation, fill, { alignmentOverride });
  }
}

export function applyWorkRowPresentation(
  workSnapshot: RowPresentationSnapshot,
  targetRow: ExcelJS.Row,
  columns: TimesheetTemplateMapping["columns"]
): void {
  for (const [key, column] of Object.entries(columns) as Array<
    [keyof TimesheetTemplateMapping["columns"], number]
  >) {
    const presentation = workSnapshot.cells[key];
    const target = targetRow.getCell(column);
    const fill = presentation.fill ?? fillForWorkColumn(key);

    if (key === "detail") {
      applyCellPresentation(target, presentation, fill, {
        alignmentOverride: {
          ...(presentation.alignment ?? {}),
          wrapText: true,
          vertical: "top"
        }
      });
      continue;
    }

    applyCellPresentation(target, presentation, fill, {
      alignmentOverride: presentation.alignment
    });
  }
}

export function applyTimesheetFont(cell: ExcelJS.Cell): void {
  cell.font = { ...(cell.font ?? {}), ...TIMESHEET_FONT };
}

export function applyTimesheetRowFonts(
  row: ExcelJS.Row,
  columns: TimesheetTemplateMapping["columns"]
): void {
  for (const column of Object.values(columns)) {
    applyTimesheetFont(row.getCell(column));
  }
}

export function applyTimesheetMetadataFonts(
  worksheet: ExcelJS.Worksheet,
  metadataCells: TimesheetTemplateMapping["metadataCells"]
): void {
  for (const address of Object.values(metadataCells)) {
    if (!address) continue;
    applyTimesheetFont(worksheet.getCell(address));
  }
}
