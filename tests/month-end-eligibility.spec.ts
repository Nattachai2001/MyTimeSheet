import { describe, expect, it } from "vitest";

import {
  daysSinceLatestSubmissionInMonth,
  shouldShowMonthEndReminder
} from "../src/reminders/month-end-eligibility.js";
import { SupDailyRecord } from "../src/storage/schemas.js";

function minimalRecord(reportDate: string): SupDailyRecord {
  return {
    schemaVersion: 1,
    reportDate,
    timezone: "Asia/Bangkok",
    user: { displayName: "Pluem" },
    source: {
      workspaceUrl: "https://example.slack.com",
      channelUrl: "https://example.slack.com/archives/C123",
      threadUrl: "manual-entry://desktop"
    },
    content: {
      yesterdayRaw: "work",
      todayRaw: "work",
      yesterdayItems: ["work"],
      todayItems: ["work"]
    },
    capturedAt: "2026-06-30T03:00:00.000Z",
    updatedAt: "2026-06-30T03:00:00.000Z",
    checksum: "test"
  };
}

describe("month-end reminder eligibility", () => {
  it("reminds when the month has no submissions", () => {
    expect(shouldShowMonthEndReminder([], "2026-06", "2026-06-30")).toBe(true);
  });

  it("reminds when the latest submission is more than 7 days ago", () => {
    const records = [minimalRecord("2026-06-20")];
    expect(daysSinceLatestSubmissionInMonth(records, "2026-06", "2026-06-30")).toBe(10);
    expect(shouldShowMonthEndReminder(records, "2026-06", "2026-06-30")).toBe(true);
  });

  it("does not remind when the latest submission is within 7 days", () => {
    const records = [minimalRecord("2026-06-25")];
    expect(daysSinceLatestSubmissionInMonth(records, "2026-06", "2026-06-30")).toBe(5);
    expect(shouldShowMonthEndReminder(records, "2026-06", "2026-06-30")).toBe(false);
  });

  it("does not remind on exactly 7 days since the latest submission", () => {
    const records = [minimalRecord("2026-06-23")];
    expect(daysSinceLatestSubmissionInMonth(records, "2026-06", "2026-06-30")).toBe(7);
    expect(shouldShowMonthEndReminder(records, "2026-06", "2026-06-30")).toBe(false);
  });
});
