import { describe, expect, it } from "vitest";

import {
  buildHolidayTitlesByDate,
  holidaySlug,
  isThaiHolidayEnabled,
  thaiHolidayDatesFromCache
} from "../src/holidays/holiday-index.js";
import { type ThaiHolidayYearCache } from "../src/holidays/thai-public-holidays.js";

const sampleCache: ThaiHolidayYearCache = {
  schemaVersion: 1,
  year: 2026,
  source: "thailandformats.com",
  fetchedAt: "2026-07-01T00:00:00.000Z",
  holidays: [
    {
      title: "Songkran Festival",
      startDate: "2026-04-13",
      endDate: "2026-04-15",
      type: "holiday",
      slug: "songkran-festival"
    },
    {
      title: "New Year's Day",
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      type: "holiday",
      slug: "new-years-day"
    }
  ],
  dates: ["2026-01-01", "2026-04-13", "2026-04-14", "2026-04-15"]
};

describe("holiday-index", () => {
  it("builds stable slugs from API data", () => {
    expect(holidaySlug(sampleCache.holidays[0])).toBe("songkran-festival");
  });

  it("excludes disabled holidays from active dates", () => {
    const disabled = new Set(["songkran-festival"]);
    expect(thaiHolidayDatesFromCache(sampleCache, disabled)).toEqual(["2026-01-01"]);
  });

  it("maps holiday titles by date for tooltips", () => {
    const titles = buildHolidayTitlesByDate([sampleCache], new Set(), ["2026-12-24"]);
    expect(titles.get("2026-04-14")).toEqual(["Songkran Festival"]);
    expect(titles.get("2026-12-24")).toEqual(["Extra holiday"]);
    expect(isThaiHolidayEnabled(sampleCache.holidays[0], new Set(["songkran-festival"]))).toBe(false);
  });
});
