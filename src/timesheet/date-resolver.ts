import { addCalendarDays, monthDates } from "../shared/date.js";
import { SupDailyRecord, ResolvedWorkDetail } from "../storage/schemas.js";
import { formatDetailItems } from "./work-entry-resolver.js";

export interface WorkCalendar {
  workingDays: number[];
  holidayDates: string[];
  excludedDates: string[];
}

export function isWorkingDate(date: string, calendar: WorkCalendar): boolean {
  const day = new Date(`${date}T00:00:00`).getDay();
  return (
    calendar.workingDays.includes(day) &&
    !calendar.holidayDates.includes(date) &&
    !calendar.excludedDates.includes(date)
  );
}

export function resolvePreviousWorkingDay(reportDate: string, calendar: WorkCalendar): string {
  let candidate = addCalendarDays(reportDate, -1);
  while (!isWorkingDate(candidate, calendar)) {
    candidate = addCalendarDays(candidate, -1);
  }
  return candidate;
}

export function resolveMonthlyWorkDetails(
  yearMonth: string,
  records: SupDailyRecord[],
  calendar: WorkCalendar
): ResolvedWorkDetail[] {
  const byReportDate = new Map(records.map((record) => [record.reportDate, record]));
  const detailFromNextReport = new Map<string, SupDailyRecord>();

  for (const record of records) {
    const actualDate = resolvePreviousWorkingDay(record.reportDate, calendar);
    detailFromNextReport.set(actualDate, record);
  }

  return monthDates(yearMonth)
    .filter((date) => isWorkingDate(date, calendar))
    .map((date) => {
      const nextReport = detailFromNextReport.get(date);
      if (nextReport?.content.yesterdayItems.length) {
        return {
          date,
          detail: formatDetailItems(nextReport.content.yesterdayItems),
          source: "next-report-yesterday",
          reportDate: nextReport.reportDate
        };
      }

      const sameReport = byReportDate.get(date);
      if (sameReport?.content.todayItems.length) {
        return {
          date,
          detail: formatDetailItems(sameReport.content.todayItems),
          source: "same-report-today",
          reportDate: sameReport.reportDate
        };
      }

      return {
        date,
        detail: "[MISSING SUP! DATA]",
        source: "missing"
      };
    });
}
