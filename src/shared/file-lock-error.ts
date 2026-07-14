import path from "node:path";

export function isFileLockError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = String((error as NodeJS.ErrnoException).code);
  return code === "EPERM" || code === "EACCES" || code === "EBUSY";
}

export function fileLockErrorMessage(targetPath: string): string {
  const name = path.basename(targetPath);
  return `Cannot access "${name}" because it is open or locked. Close Excel (or any app using this file), then try again.`;
}

export function toFileLockError(error: unknown, targetPath: string): Error {
  if (isFileLockError(error)) {
    return new Error(fileLockErrorMessage(targetPath));
  }
  return error instanceof Error ? error : new Error(String(error));
}
