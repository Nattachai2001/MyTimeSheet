import { describe, expect, it } from "vitest";

import { isLastDayOfMonthBangkok } from "../src/shared/date.js";

describe("month-end reminder helpers", () => {
  it("detects the last day of a month", () => {
    expect(isLastDayOfMonthBangkok("2026-06-30")).toBe(true);
    expect(isLastDayOfMonthBangkok("2026-06-29")).toBe(false);
    expect(isLastDayOfMonthBangkok("2026-02-28")).toBe(true);
  });
});
