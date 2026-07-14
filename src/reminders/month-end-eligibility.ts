import { differenceInCalendarDays, parseISO } from "date-fns";

import { SupDailyRecord } from "../storage/schemas.js";

export const MONTH_END_SUBMISSION_GAP_DAYS = 7;

export function daysSinceLatestSubmissionInMonth(
  records: SupDailyRecord[],
  month: string,
  today: string
): number | null {
  const monthRecords = records.filter((record) => record.reportDate.startsWith(`${month}-`));
  if (!monthRecords.length) return null;

  const latest = monthRecords.reduce(
    (max, record) => (record.reportDate > max ? record.reportDate : max),
    monthRecords[0].reportDate
  );

  return differenceInCalendarDays(parseISO(`${today}T00:00:00`), parseISO(`${latest}T00:00:00`));
}

export function shouldShowMonthEndReminder(
  records: SupDailyRecord[],
  month: string,
  today: string,
  gapDays = MONTH_END_SUBMISSION_GAP_DAYS
): boolean {
  const daysSince = daysSinceLatestSubmissionInMonth(records, month, today);
  if (daysSince === null) return true;
  return daysSince > gapDays;
}
