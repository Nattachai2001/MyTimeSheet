import ExcelJS from "exceljs";

export interface TimesheetTemplateMapping {
  sheetName: string;
  headerRow: number;
  firstDataRow: number;
  columns: {
    taskCode: number;
    role: number;
    date: number;
    timeIn: number;
    timeOut: number;
    includedLunch: number;
    hours: number;
    detail: number;
  };
  metadataCells: {
    period?: string;
    staffName?: string;
    site?: string;
  };
}

const headerAliases: Record<keyof TimesheetTemplateMapping["columns"], string[]> = {
  taskCode: ["task code and task name", "task code", "task name"],
  role: ["role"],
  date: ["date"],
  timeIn: ["time in"],
  timeOut: ["time out"],
  includedLunch: ["included lunch time", "included lunch"],
  hours: ["hours"],
  detail: ["detail"]
};

export function detectTimesheetMapping(workbook: ExcelJS.Workbook): TimesheetTemplateMapping {
  const worksheet = findWorksheetByPattern(workbook, /standard/i) ?? workbook.worksheets[0];
  if (!worksheet) throw new Error("Workbook has no worksheets.");
  return detectSheetMapping(worksheet);
}

export function detectOvertimeMapping(workbook: ExcelJS.Workbook): TimesheetTemplateMapping | null {
  const worksheet = findWorksheetByPattern(workbook, /overtime/i);
  if (!worksheet) return null;

  try {
    return detectSheetMapping(worksheet);
  } catch {
    return null;
  }
}

export function findWorksheetByPattern(
  workbook: ExcelJS.Workbook,
  pattern: RegExp
): ExcelJS.Worksheet | undefined {
  return workbook.worksheets.find((sheet) => pattern.test(sheet.name));
}

export function detectSheetMapping(worksheet: ExcelJS.Worksheet): TimesheetTemplateMapping {
  let headerRow: number | undefined;
  const columns: Partial<TimesheetTemplateMapping["columns"]> = {};

  worksheet.eachRow((row, rowNumber) => {
    if (headerRow) return;
    const detected: Partial<TimesheetTemplateMapping["columns"]> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = normalizeHeader(cellText(cell));
      for (const [key, aliases] of Object.entries(headerAliases)) {
        if (aliases.some((alias) => text === alias || text.includes(alias))) {
          detected[key as keyof TimesheetTemplateMapping["columns"]] = colNumber;
        }
      }
    });

    if (detected.date && detected.timeIn && detected.timeOut && detected.detail) {
      headerRow = rowNumber;
      Object.assign(columns, detected);
    }
  });

  if (!headerRow) {
    throw new Error("Could not identify the Date, Time In, Time Out, or Detail columns.");
  }

  const required = ["taskCode", "role", "date", "timeIn", "timeOut", "includedLunch", "hours", "detail"] as const;
  for (const key of required) {
    if (!columns[key]) {
      throw new Error(`Template mapping failed: missing column '${key}'.`);
    }
  }

  return {
    sheetName: worksheet.name,
    headerRow,
    firstDataRow: headerRow + 1,
    columns: columns as TimesheetTemplateMapping["columns"],
    metadataCells: detectMetadataCells(worksheet)
  };
}

export function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  if (typeof value === "object" && "text" in value && typeof value.text === "string") return value.text;
  if (typeof value === "object" && "result" in value) return String(value.result ?? "");
  return String(value);
}

function detectMetadataCells(worksheet: ExcelJS.Worksheet): TimesheetTemplateMapping["metadataCells"] {
  const metadata: TimesheetTemplateMapping["metadataCells"] = {};

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const text = normalizeHeader(cellText(cell));
      const nextAddress = worksheet.getCell(cell.row, cell.col + 1).address;
      if (text === "period :" || text === "period:") metadata.period = nextAddress;
      if (text === "staff name :" || text === "staff name:") metadata.staffName = nextAddress;
      if (text === "site :" || text === "site:") metadata.site = nextAddress;
    });
  });

  return metadata;
}
