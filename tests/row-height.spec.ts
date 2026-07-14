import { describe, expect, it } from "vitest";

import { estimateWrappedLineCount, rowHeightForWrappedText } from "../src/timesheet/row-height.js";

describe("row height estimation", () => {
  it("counts explicit newlines", () => {
    expect(estimateWrappedLineCount("one\ntwo\nthree", 20)).toBe(3);
  });

  it("wraps long single-line text", () => {
    expect(estimateWrappedLineCount("a".repeat(41), 20)).toBe(3);
  });

  it("scales row height with wrapped lines", () => {
    expect(rowHeightForWrappedText("short", 30)).toBe(15);
    expect(rowHeightForWrappedText("a".repeat(60), 20)).toBe(45);
  });

  it("caps at Excel max row height", () => {
    expect(rowHeightForWrappedText("a".repeat(10_000), 10)).toBe(409);
  });
});
