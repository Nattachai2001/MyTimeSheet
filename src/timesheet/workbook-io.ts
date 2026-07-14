import { readFile, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";

import { toFileLockError } from "../shared/file-lock-error.js";

import "./exceljs-bootstrap.js";

export async function readWorkbookFromPath(workbook: ExcelJS.Workbook, filePath: string): Promise<void> {
  try {
    const buffer = await readFile(filePath);
    await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
  } catch (error) {
    throw toFileLockError(error, filePath);
  }
}

export async function writeWorkbookToPath(workbook: ExcelJS.Workbook, filePath: string): Promise<void> {
  try {
    const buffer = await workbook.xlsx.writeBuffer();
    await writeFile(filePath, new Uint8Array(buffer));
  } catch (error) {
    throw toFileLockError(error, filePath);
  }
}
