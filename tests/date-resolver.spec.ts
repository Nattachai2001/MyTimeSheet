import { describe, expect, it } from "vitest";

import { resolveMonthlyWorkDetails, resolvePreviousWorkingDay } from "../src/timesheet/date-resolver.js";
import { SupDailyRecord } from "../src/storage/schemas.js";

const calendar = {
  workingDays: [1, 2, 3, 4, 5],
  holidayDates: [],
  excludedDates: []
};

describe("date resolver", () => {
  it("maps Monday report yesterday to previous Friday", () => {
    expect(resolvePreviousWorkingDay("2026-07-06", calendar)).toBe("2026-07-03");
  });

  it("prefers next report yesterday and falls back to same report today", () => {
    const records = [
      record("2026-07-01", ["Tuesday actual"], ["Wednesday plan"]),
      record("2026-07-02", ["Wednesday actual"], ["Thursday plan"])
    ];

    const details = resolveMonthlyWorkDetails("2026-07", records, calendar);
    expect(details.find((detail) => detail.date === "2026-07-01")?.detail).toBe("Wednesday actual");
    expect(details.find((detail) => detail.date === "2026-07-02")?.detail).toBe("Thursday plan");
  });
});

function record(reportDate: string, yesterdayItems: string[], todayItems: string[]): SupDailyRecord {
  return {
    schemaVersion: 1,
    reportDate,
    timezone: "Asia/Bangkok",
    user: { displayName: "Pluem" },
    source: {
      workspaceUrl: "https://example.slack.com",
      channelUrl: "https://example.slack.com/archives/C123"
    },
    content: {
      yesterdayRaw: yesterdayItems.join("\n"),
      todayRaw: todayItems.join("\n"),
      yesterdayItems,
      todayItems
    },
    capturedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    checksum: "test"
  };
}
