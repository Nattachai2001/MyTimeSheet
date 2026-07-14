import { existsSync } from "node:fs";
import { copyFile, rename, unlink } from "node:fs/promises";

import { fileLockErrorMessage, isFileLockError } from "./file-lock-error.js";

export async function replaceFileAtomically(tempPath: string, outputPath: string): Promise<void> {
  try {
    if (existsSync(outputPath)) {
      await unlink(outputPath);
    }
    await rename(tempPath, outputPath);
  } catch (error) {
    if (isFileLockError(error)) {
      await unlink(tempPath).catch(() => {});
      throw new Error(fileLockErrorMessage(outputPath));
    }

    try {
      await copyFile(tempPath, outputPath);
      await unlink(tempPath);
    } catch (fallbackError) {
      await unlink(tempPath).catch(() => {});
      if (isFileLockError(fallbackError)) {
        throw new Error(fileLockErrorMessage(outputPath));
      }
      throw fallbackError;
    }
  }
}
