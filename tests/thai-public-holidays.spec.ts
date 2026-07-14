import { describe, expect, it } from "vitest";

import {
  expandHolidayToDates,
  holidaysToDates,
  isCacheFresh,
  type ThaiHolidayYearCache
} from "../src/holidays/thai-public-holidays.js";

describe("thai-public-holidays", () => {
  it("expands multi-day holidays into individual dates", () => {
    expect(expandHolidayToDates("2026-04-13", "2026-04-15")).toEqual([
      "2026-04-13",
      "2026-04-14",
      "2026-04-15"
    ]);
  });

  it("deduplicates overlapping holiday ranges", () => {
    const dates = holidaysToDates([
      { title: "Songkran", startDate: "2026-04-13", endDate: "2026-04-15", type: "holiday" },
      { title: "Extra", startDate: "2026-04-15", endDate: "2026-04-15", type: "holiday" }
    ]);
    expect(dates).toEqual(["2026-04-13", "2026-04-14", "2026-04-15"]);
  });

  it("treats cache younger than 30 days as fresh", () => {
    const cache: ThaiHolidayYearCache = {
      schemaVersion: 1,
      year: 2026,
      source: "thailandformats.com",
      fetchedAt: new Date("2026-07-01T00:00:00.000Z").toISOString(),
      holidays: [],
      dates: []
    };
    expect(isCacheFresh(cache, new Date("2026-07-10T00:00:00.000Z").getTime())).toBe(true);
    expect(isCacheFresh(cache, new Date("2026-08-15T00:00:00.000Z").getTime())).toBe(false);
  });
});
