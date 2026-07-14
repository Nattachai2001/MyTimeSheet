import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { addCalendarDays, todayBangkok } from "../shared/date.js";

export const THAI_HOLIDAY_API = "https://thailandformats.com/api/v1/holidays";
export const THAI_HOLIDAY_SOURCE = "thailandformats.com";
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ThaiPublicHoliday {
  title: string;
  startDate: string;
  endDate: string;
  type: string;
  slug?: string;
}

export interface ThaiHolidayYearCache {
  schemaVersion: 1;
  year: number;
  source: string;
  fetchedAt: string;
  holidays: ThaiPublicHoliday[];
  dates: string[];
}

interface ThaiHolidayApiResponse {
  year: number;
  holidays: Array<{
    title: string;
    start_date: string;
    end_date: string;
    type: string;
    slug: string;
  }>;
}

export function expandHolidayToDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    current = addCalendarDays(current, 1);
  }
  return dates;
}

export function holidaysToDates(holidays: ThaiPublicHoliday[]): string[] {
  const set = new Set<string>();
  for (const holiday of holidays) {
    for (const date of expandHolidayToDates(holiday.startDate, holiday.endDate)) {
      set.add(date);
    }
  }
  return [...set].sort();
}

export function cachePathForYear(storageRoot: string, year: number): string {
  return path.join(storageRoot, "holidays", "thailand", `${year}.json`);
}

export function yearsForMonth(month: string): number[] {
  return [Number(month.slice(0, 4))];
}

export function defaultHolidayYears(referenceDate = todayBangkok()): number[] {
  const currentYear = Number(referenceDate.slice(0, 4));
  return [currentYear - 1, currentYear, currentYear + 1];
}

export function isCacheFresh(cache: ThaiHolidayYearCache, now = Date.now()): boolean {
  const age = now - new Date(cache.fetchedAt).getTime();
  return age >= 0 && age < CACHE_TTL_MS;
}

export async function fetchThaiPublicHolidaysFromApi(year: number): Promise<ThaiPublicHoliday[]> {
  const response = await fetch(`${THAI_HOLIDAY_API}/${year}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch Thai public holidays for ${year}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ThaiHolidayApiResponse;
  return payload.holidays.map((holiday) => ({
    title: holiday.title,
    startDate: holiday.start_date,
    endDate: holiday.end_date,
    type: holiday.type,
    slug: holiday.slug
  }));
}

export async function readCachedYear(storageRoot: string, year: number): Promise<ThaiHolidayYearCache | undefined> {
  const filePath = cachePathForYear(storageRoot, year);
  if (!existsSync(filePath)) return undefined;

  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as ThaiHolidayYearCache;
  } catch {
    return undefined;
  }
}

export async function writeCachedYear(storageRoot: string, cache: ThaiHolidayYearCache): Promise<void> {
  const filePath = cachePathForYear(storageRoot, cache.year);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export async function getThaiPublicHolidaysForYear(
  storageRoot: string,
  year: number,
  options?: { forceRefresh?: boolean }
): Promise<ThaiHolidayYearCache> {
  const cached = await readCachedYear(storageRoot, year);
  if (cached && isCacheFresh(cached) && !options?.forceRefresh) {
    return cached;
  }

  try {
    const holidays = await fetchThaiPublicHolidaysFromApi(year);
    const entry: ThaiHolidayYearCache = {
      schemaVersion: 1,
      year,
      source: THAI_HOLIDAY_SOURCE,
      fetchedAt: new Date().toISOString(),
      holidays,
      dates: holidaysToDates(holidays)
    };
    await writeCachedYear(storageRoot, entry);
    return entry;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

export async function getThaiPublicHolidayDates(
  storageRoot: string,
  years: number[],
  options?: { forceRefresh?: boolean }
): Promise<string[]> {
  const set = new Set<string>();
  for (const year of years) {
    const cache = await getThaiPublicHolidaysForYear(storageRoot, year, options);
    for (const date of cache.dates) set.add(date);
  }
  return [...set].sort();
}
