import { describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import ExcelJS from "exceljs";
import { repairTimesheetStylesFromTemplate } from "../src/timesheet/xlsx-style-repair.js";

const templatePath = "templates/7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx";

function rowStyleIndices(filePath: string, row: number): string[] {
  const dir = `tmp/test-repair-${row}-${Date.now()}`;
  mkdirSync(dir, { recursive: true });
  execSync(`tar -xf "${filePath}" -C "${dir}"`, { stdio: "pipe" });
  const sheet = readFileSync(`${dir}/xl/worksheets/sheet1.xml`, "utf8");
  rmSync(dir, { recursive: true, force: true });
  const rowMatch = sheet.match(new RegExp(`<row[^>]*r="${row}"[^>]*>([\\s\\S]*?)</row>`));
  if (!rowMatch) return [];
  return [...rowMatch[1].matchAll(/<c[^>]*r="([A-H])\d+"[^>]*s="(\d+)"/g)].map((m) => `${m[1]}=${m[2]}`);
}

function cellStyleIndex(filePath: string, ref: string): string | undefined {
  const dir = `tmp/test-cell-${Date.now()}`;
  mkdirSync(dir, { recursive: true });
  execSync(`tar -xf "${filePath}" -C "${dir}"`, { stdio: "pipe" });
  const sheet = readFileSync(`${dir}/xl/worksheets/sheet1.xml`, "utf8");
  rmSync(dir, { recursive: true, force: true });
  const match = sheet.match(new RegExp(`<c[^>]*r="${ref}"[^>]*s="(\\d+)"`));
  return match?.[1];
}

function readStylesXml(filePath: string): string {
  const dir = `tmp/test-styles-${Date.now()}`;
  mkdirSync(dir, { recursive: true });
  execSync(`tar -xf "${filePath}" -C "${dir}"`, { stdio: "pipe" });
  const styles = readFileSync(`${dir}/xl/styles.xml`, "utf8");
  rmSync(dir, { recursive: true, force: true });
  return styles;
}

function readXfElements(stylesXml: string): string[] {
  const cellXfsBody = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  const xfs: string[] = [];
  let position = 0;
  while (position < cellXfsBody.length) {
    const start = cellXfsBody.indexOf("<xf", position);
    if (start === -1) break;
    const openEnd = cellXfsBody.indexOf(">", start);
    const element =
      cellXfsBody[openEnd - 1] === "/"
        ? cellXfsBody.slice(start, openEnd + 1)
        : cellXfsBody.slice(start, cellXfsBody.indexOf("</xf>", openEnd + 1) + 5);
    xfs.push(element);
    position = start + element.length;
  }
  return xfs;
}

function detailStyleAlignment(stylesXml: string, styleIndex: string): string | undefined {
  const xf = readXfElements(stylesXml)[Number(styleIndex)];
  return xf?.match(/<alignment\b([^>]*)\/>/)?.[1];
}

describe("repairTimesheetStylesFromTemplate", () => {
  it.skipIf(!existsSync(templatePath))("restores template style indices for holiday rows", () => {
    const outputPath = "tmp/test-repair-output.xlsx";
    copyFileSync(templatePath, outputPath);

    repairTimesheetStylesFromTemplate(templatePath, outputPath, {
      holidayReferenceRow: 10,
      prestyledHolidayRows: new Set([10, 11, 17, 18]),
      convertedHolidayRows: new Set(),
      firstDataRow: 7,
      lastDataRow: 37
    });

    expect(rowStyleIndices(templatePath, 10)).toEqual(rowStyleIndices(outputPath, 10));
  });

  it.skipIf(!existsSync(templatePath))("restores footer and extended column styles from template", async () => {
    const outputPath = "tmp/test-repair-footer.xlsx";
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.worksheets[0];
    worksheet.getCell("A3").value = "Changed metadata";
    await workbook.xlsx.writeFile(outputPath);

    repairTimesheetStylesFromTemplate(templatePath, outputPath, {
      holidayReferenceRow: 10,
      prestyledHolidayRows: new Set([10, 11]),
      convertedHolidayRows: new Set(),
      firstDataRow: 7,
      lastDataRow: 37
    });

    expect(cellStyleIndex(outputPath, "L12")).toBe(cellStyleIndex(templatePath, "L12"));
    expect(cellStyleIndex(outputPath, "A39")).toBe(cellStyleIndex(templatePath, "A39"));
  });

  it.skipIf(!existsSync(templatePath))("preserves header and metadata alignments while wrapping detail", async () => {
    const outputPath = "tmp/test-repair-align.xlsx";
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    await workbook.xlsx.writeFile(outputPath);

    repairTimesheetStylesFromTemplate(templatePath, outputPath, {
      holidayReferenceRow: 10,
      prestyledHolidayRows: new Set([10, 11]),
      convertedHolidayRows: new Set(),
      firstDataRow: 7,
      lastDataRow: 37,
      detailColumnNumber: 8
    });

    const styles = readStylesXml(outputPath);
    expect(detailStyleAlignment(styles, "7")).toContain('horizontal="right"');
    expect(detailStyleAlignment(styles, "14")).toContain('horizontal="center"');
    expect(detailStyleAlignment(styles, "24")).toContain('horizontal="center"');
    expect(detailStyleAlignment(styles, "25")).toContain('horizontal="center"');
    expect(detailStyleAlignment(styles, "26")).toContain('wrapText="1"');
  });

  it.skipIf(!existsSync(templatePath))("enables wrap text on detail column styles", async () => {
    const outputPath = "tmp/test-repair-wrap.xlsx";
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.worksheets[0];
    worksheet.getCell("H9").value = "x".repeat(120);
    await workbook.xlsx.writeFile(outputPath);

    repairTimesheetStylesFromTemplate(templatePath, outputPath, {
      holidayReferenceRow: 10,
      prestyledHolidayRows: new Set([10, 11]),
      convertedHolidayRows: new Set(),
      firstDataRow: 7,
      lastDataRow: 37,
      detailColumnNumber: 8
    });

    const styles = readStylesXml(outputPath);
    const detailStyle = cellStyleIndex(outputPath, "H9");
    expect(detailStyle).toBeDefined();
    const alignment = detailStyleAlignment(styles, detailStyle!);
    expect(alignment).toContain('wrapText="1"');
    expect(alignment).toContain('vertical="top"');
  });
});
