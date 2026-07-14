import { addCalendarDays } from "../shared/date.js";
import {
  expandHolidayToDates,
  getThaiPublicHolidaysForYear,
  ThaiHolidayYearCache,
  ThaiPublicHoliday
} from "./thai-public-holidays.js";

export function holidaySlug(holiday: Pick<ThaiPublicHoliday, "slug" | "title" | "startDate">): string {
  if (holiday.slug) return holiday.slug;
  return `${holiday.startDate}-${slugify(holiday.title)}`;
}

export function isThaiHolidayEnabled(holiday: ThaiPublicHoliday, disabledSlugs: Set<string>): boolean {
  return !disabledSlugs.has(holidaySlug(holiday));
}

export function thaiHolidayDatesFromCache(
  cache: ThaiHolidayYearCache,
  disabledSlugs: Set<string>
): string[] {
  const dates = new Set<string>();
  for (const holiday of cache.holidays) {
    if (!isThaiHolidayEnabled(holiday, disabledSlugs)) continue;
    for (const date of expandHolidayToDates(holiday.startDate, holiday.endDate)) {
      dates.add(date);
    }
  }
  return [...dates].sort();
}

export function buildHolidayTitlesByDate(
  caches: ThaiHolidayYearCache[],
  disabledSlugs: Set<string>,
  extraHolidayDates: string[] = []
): Map<string, string[]> {
  const titlesByDate = new Map<string, string[]>();

  for (const cache of caches) {
    for (const holiday of cache.holidays) {
      if (!isThaiHolidayEnabled(holiday, disabledSlugs)) continue;
      for (const date of expandHolidayToDates(holiday.startDate, holiday.endDate)) {
        appendTitle(titlesByDate, date, holiday.title);
      }
    }
  }

  for (const date of extraHolidayDates) {
    appendTitle(titlesByDate, date, "Extra holiday");
  }

  return titlesByDate;
}

export async function getHolidayTitlesForMonth(
  storageRoot: string,
  month: string,
  disabledThaiHolidaySlugs: string[],
  extraHolidayDates: string[]
): Promise<Map<string, string[]>> {
  const year = Number(month.slice(0, 4));
  const cache = await getThaiPublicHolidaysForYear(storageRoot, year);
  return buildHolidayTitlesByDate([cache], new Set(disabledThaiHolidaySlugs), extraHolidayDates);
}

function appendTitle(map: Map<string, string[]>, date: string, title: string): void {
  const existing = map.get(date) ?? [];
  if (!existing.includes(title)) existing.push(title);
  map.set(date, existing);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
