import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  isValid,
  parse,
  parseISO,
  startOfMonth,
  subMonths
} from "date-fns";

export function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function nowBangkokHHMM(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

export function isLastDayOfMonthBangkok(date: string): boolean {
  const parsed = parseISO(`${date}T00:00:00`);
  return format(parsed, "yyyy-MM-dd") === format(endOfMonth(parsed), "yyyy-MM-dd");
}

export function previousMonthBangkok(): string {
  const current = parseISO(`${todayBangkok()}T00:00:00`);
  return format(subMonths(current, 1), "yyyy-MM");
}

export function currentMonthBangkok(): string {
  return todayBangkok().slice(0, 7);
}

export function monthDates(yearMonth: string): string[] {
  const start = parseISO(`${yearMonth}-01T00:00:00`);
  return eachDayOfInterval({ start: startOfMonth(start), end: endOfMonth(start) }).map((date) =>
    format(date, "yyyy-MM-dd")
  );
}

export function addCalendarDays(date: string, days: number): string {
  return format(addDays(parseISO(`${date}T00:00:00`), days), "yyyy-MM-dd");
}

export function isDateInMonth(date: string, yearMonth: string): boolean {
  return date.startsWith(`${yearMonth}-`);
}

export function dateToDisplay(date: string): string {
  const parsed = parseISO(`${date}T00:00:00`);
  return format(parsed, "d/M/yyyy");
}

export function parseExcelDisplayDate(value: unknown): string | undefined {
  if (value instanceof Date && isValid(value)) return format(value, "yyyy-MM-dd");
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  for (const pattern of ["d/M/yyyy", "dd/MM/yyyy", "M/d/yyyy", "MM/dd/yyyy"]) {
    const parsed = parse(trimmed, pattern, new Date());
    if (isValid(parsed)) return format(parsed, "yyyy-MM-dd");
  }
  return undefined;
}
