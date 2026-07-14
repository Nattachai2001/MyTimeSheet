import { describe, expect, it } from "vitest";

import { fileLockErrorMessage, isFileLockError } from "../src/shared/file-lock-error.js";

describe("file lock errors", () => {
  it("detects permission errors", () => {
    expect(isFileLockError({ code: "EPERM" })).toBe(true);
    expect(isFileLockError({ code: "EBUSY" })).toBe(true);
    expect(isFileLockError({ code: "ENOENT" })).toBe(false);
  });

  it("builds a readable lock message", () => {
    expect(fileLockErrorMessage("C:\\data\\output\\Skilllane - TimeSheet.xlsx")).toContain(
      "Skilllane - TimeSheet.xlsx"
    );
    expect(fileLockErrorMessage("C:\\data\\output\\Skilllane - TimeSheet.xlsx")).toContain("Close Excel");
  });
});
