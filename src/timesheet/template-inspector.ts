import ExcelJS from "exceljs";

import { cellText, detectOvertimeMapping, detectTimesheetMapping } from "./template-mapper.js";
import { readWorkbookFromPath } from "./workbook-io.js";

export interface TemplateInspection {
  sheets: string[];
  mapping: ReturnType<typeof detectTimesheetMapping>;
  overtimeMapping: ReturnType<typeof detectOvertimeMapping>;
  mergedRanges: string[];
  formulaCells: Array<{ sheet: string; address: string; formula: string }>;
  usedRanges: Array<{ sheet: string; rowCount: number; columnCount: number }>;
}

export async function inspectTemplate(templatePath: string): Promise<TemplateInspection> {
  const workbook = new ExcelJS.Workbook();
  await readWorkbookFromPath(workbook, templatePath);

  const formulaCells: TemplateInspection["formulaCells"] = [];
  const usedRanges: TemplateInspection["usedRanges"] = [];

  for (const worksheet of workbook.worksheets) {
    usedRanges.push({
      sheet: worksheet.name,
      rowCount: worksheet.rowCount,
      columnCount: worksheet.columnCount
    });

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        const value = cell.value;
        if (value && typeof value === "object" && "formula" in value) {
          formulaCells.push({
            sheet: worksheet.name,
            address: cell.address,
            formula: String(value.formula)
          });
        }
      });
    });
  }

  const mapping = detectTimesheetMapping(workbook);
  const overtimeMapping = detectOvertimeMapping(workbook);
  const sheet = workbook.getWorksheet(mapping.sheetName);
  const merges = (sheet?.model as { merges?: string[] } | undefined)?.merges ?? [];
  const mergedRanges = Array.isArray(merges) ? merges : Object.keys(merges);

  return {
    sheets: workbook.worksheets.map((worksheet) => worksheet.name),
    mapping,
    overtimeMapping,
    mergedRanges,
    formulaCells,
    usedRanges
  };
}

export function printInspection(inspection: TemplateInspection): string {
  const lines: string[] = [];
  lines.push("Template inspection");
  lines.push("");
  lines.push(`Sheets: ${inspection.sheets.join(", ")}`);
  lines.push("Used ranges:");
  for (const range of inspection.usedRanges) {
    lines.push(`- ${range.sheet}: rows=${range.rowCount}, columns=${range.columnCount}`);
  }
  lines.push("");
  lines.push(`Standard sheet: ${inspection.mapping.sheetName}`);
  lines.push(`Header row: ${inspection.mapping.headerRow}`);
  lines.push(`First data row: ${inspection.mapping.firstDataRow}`);
  lines.push(`Columns: ${JSON.stringify(inspection.mapping.columns)}`);
  lines.push(`Metadata cells: ${JSON.stringify(inspection.mapping.metadataCells)}`);
  if (inspection.overtimeMapping) {
    lines.push("");
    lines.push(`Overtime sheet: ${inspection.overtimeMapping.sheetName}`);
    lines.push(`Overtime header row: ${inspection.overtimeMapping.headerRow}`);
    lines.push(`Overtime first data row: ${inspection.overtimeMapping.firstDataRow}`);
    lines.push(`Overtime columns: ${JSON.stringify(inspection.overtimeMapping.columns)}`);
  } else {
    lines.push("");
    lines.push("Overtime sheet: not detected");
  }
  lines.push(`Merged ranges: ${inspection.mergedRanges.join(", ") || "(none)"}`);
  lines.push(`Formula cells: ${inspection.formulaCells.length}`);
  for (const formula of inspection.formulaCells.slice(0, 30)) {
    lines.push(`- ${formula.sheet}!${formula.address}: ${formula.formula}`);
  }
  return lines.join("\n");
}

export function printableCell(cell: ExcelJS.Cell): string {
  return cellText(cell).replace(/\n/g, "\\n");
}
