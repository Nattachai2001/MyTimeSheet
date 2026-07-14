import path from "node:path";

export type TimesheetOutputExtension = "xlsx" | "pdf";

export function formatTimesheetPeriod(month: string): string {
  const [year, monthText] = month.split("-");
  return `${year}${monthText}`;
}

export function resolveTimesheetFilename(options: {
  site: string;
  month: string;
  staffName: string;
  extension: TimesheetOutputExtension;
}): string {
  return `${options.site} - TimeSheet ${formatTimesheetPeriod(options.month)} - ${options.staffName}.${options.extension}`;
}

export function resolveTimesheetOutputPath(options: {
  rootDirectory: string;
  month: string;
  site: string;
  staffName: string;
  extension: TimesheetOutputExtension;
}): string {
  const [year, monthText] = options.month.split("-");
  return path.join(
    options.rootDirectory,
    "output",
    year,
    monthText,
    resolveTimesheetFilename(options)
  );
}
