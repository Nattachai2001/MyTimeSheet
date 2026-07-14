import { thaiHolidayDatesFromCache } from "./holiday-index.js";
import {
  defaultHolidayYears,
  getThaiPublicHolidayDates,
  getThaiPublicHolidaysForYear
} from "./thai-public-holidays.js";

export async function resolveWorkHolidayDates(
  storageRoot: string,
  extraHolidayDates: string[],
  years: number[],
  disabledThaiHolidaySlugs: string[] = [],
  options?: { forceRefresh?: boolean }
): Promise<string[]> {
  const disabled = new Set(disabledThaiHolidaySlugs);
  const dates = new Set(extraHolidayDates.filter(Boolean));

  for (const year of years) {
    const cache = await getThaiPublicHolidaysForYear(storageRoot, year, options);
    for (const date of thaiHolidayDatesFromCache(cache, disabled)) {
      dates.add(date);
    }
  }

  return [...dates].sort();
}

export async function prefetchThaiPublicHolidays(
  storageRoot: string,
  referenceDate?: string
): Promise<void> {
  await getThaiPublicHolidayDates(storageRoot, defaultHolidayYears(referenceDate));
}
