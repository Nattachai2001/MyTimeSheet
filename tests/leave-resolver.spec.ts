import { describe, expect, it } from "vitest";

import { applyLeaveEntries } from "../src/timesheet/leave-resolver.js";
import { defaultLeaveDetail, formatLeaveDetail } from "../src/timesheet/leave-types.js";
import { ResolvedWorkDetail } from "../src/storage/schemas.js";

describe("leave-resolver", () => {
  it("overrides missing work days with leave entries", () => {
    const details: ResolvedWorkDetail[] = [
      { date: "2026-07-01", detail: "[MISSING SUP! DATA]", source: "missing" },
      { date: "2026-07-02", detail: "Actual work", source: "same-report-today" }
    ];

    const result = applyLeaveEntries(details, [
      { date: "2026-07-01", type: "annual" },
      { date: "2026-07-03", type: "sick", detail: "Doctor visit" }
    ]);

    expect(result[0]).toEqual({
      date: "2026-07-01",
      detail: defaultLeaveDetail("annual"),
      source: "annual-leave"
    });
    expect(result[1].source).toBe("same-report-today");
  });

  it("formats half-day sick leave detail with period", () => {
    const details: ResolvedWorkDetail[] = [
      { date: "2026-07-04", detail: "Actual work", source: "same-report-today" }
    ];

    const result = applyLeaveEntries(details, [
      { date: "2026-07-04", type: "sick", halfDay: true, halfDayPeriod: "afternoon" }
    ]);

    expect(result[0]).toEqual({
      date: "2026-07-04",
      detail: formatLeaveDetail("sick", { halfDay: true, halfDayPeriod: "afternoon" }),
      source: "sick-leave",
      halfDay: true,
      halfDayPeriod: "afternoon",
      timeIn: "13:00",
      timeOut: "18:00",
      hours: 5,
      includedLunch: null
    });
  });
});
