import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";

import { toFileLockError } from "../shared/file-lock-error.js";
import { ensureExcelJsPackagedCompat } from "./exceljs-packaged-compat.js";

ensureExcelJsPackagedCompat();

export async function readWorkbookFromPath(workbook: ExcelJS.Workbook, filePath: string): Promise<void> {
  try {
    const buffer = await readFile(filePath);
    // ExcelJS typings expect Node's legacy Buffer alias; fs.readFile returns a compatible Uint8Array.
    await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Xlsx["load"]>[0]);
  } catch (error) {
    throw toFileLockError(error, filePath);
  }
}
