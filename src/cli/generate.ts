import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "../config/env.js";
import { parseArgs, requireStringArg } from "../shared/args.js";
import { previousMonthBangkok } from "../shared/date.js";
import { DailyRecordRepository } from "../storage/daily-record-repository.js";
import { OvertimeRecordRepository } from "../storage/overtime-record-repository.js";
import { LeaveRecordRepository } from "../storage/leave-record-repository.js";
import { SupDailyRecordSchema, ResolvedWorkDetail } from "../storage/schemas.js";
import { resolveMonthTimesheetDetails } from "../timesheet/leave-resolver.js";
import { resolveMonthlyWorkDetails } from "../timesheet/date-resolver.js";
import { generateTimesheet } from "../timesheet/excel-generator.js";
import { resolveTimesheetOutputPath } from "../timesheet/output-path.js";
import { exportWorkbookToPdf } from "../timesheet/pdf-exporter.js";
import { ensureTemplateForMonth } from "../timesheet/ensure-template.js";
import { yearsForMonth } from "../holidays/thai-public-holidays.js";
import { resolveWorkHolidayDates } from "../holidays/resolve-work-holidays.js";

const args = parseArgs();
const config = await loadConfig();
const month = requireStringArg(args, "month", previousMonthBangkok());
const templateFolder =
  typeof args.templateFolder === "string"
    ? path.resolve(args.templateFolder)
    : path.join(config.storage.rootDirectory, "templates");
const templatePath =
  typeof args.template === "string"
    ? path.resolve(args.template)
    : (
        await ensureTemplateForMonth({
          month,
          config,
          templateFolder,
          configuredFilename: config.timesheet.templateFilename
        })
      ).templatePath;
const outputPath =
  typeof args.output === "string"
    ? path.resolve(args.output)
    : resolveTimesheetOutputPath({
        rootDirectory: config.storage.rootDirectory,
        month,
        site: config.timesheet.site,
        staffName: config.timesheet.staffName,
        extension: "xlsx"
      });

const details =
  typeof args.data === "string"
    ? await loadDetailsFromData(args.data, month)
    : await loadDetailsFromInbox(config.storage.rootDirectory, month, config);
const overtimeEntries = await new OvertimeRecordRepository(config.storage.rootDirectory).readMonth(month);

const result = await generateTimesheet({ templatePath, outputPath, month, details, config, overtimeEntries });
console.log(`Generated: ${result.outputPath}`);
console.log(`Filled days: ${result.filledDates.length}`);
if (result.missingDates.length) console.log(`Missing days: ${result.missingDates.join(", ")}`);
console.log(formatOvertimeResult(result.overtime));

if (process.platform === "win32" && args.pdf !== false) {
  const pdfPath = resolveTimesheetOutputPath({
    rootDirectory: config.storage.rootDirectory,
    month,
    site: config.timesheet.site,
    staffName: config.timesheet.staffName,
    extension: "pdf"
  });
  try {
    await exportWorkbookToPdf(result.outputPath, pdfPath);
    console.log(`PDF exported: ${pdfPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

async function loadDetailsFromInbox(
  rootDirectory: string,
  yearMonth: string,
  loadedConfig: typeof config
): Promise<ResolvedWorkDetail[]> {
  const repository = new DailyRecordRepository(rootDirectory);
  const records = await repository.readMonth(yearMonth);
  const holidayDates = await resolveWorkHolidayDates(
    rootDirectory,
    extraHolidayDatesFromConfig(loadedConfig.work),
    yearsForMonth(yearMonth),
    loadedConfig.work.disabledThaiHolidaySlugs
  );
  const leaveEntries = await new LeaveRecordRepository(rootDirectory).readMonth(yearMonth);
  return resolveMonthTimesheetDetails(
    yearMonth,
    records,
    {
      workingDays: loadedConfig.work.workingDays,
      holidayDates,
      excludedDates: loadedConfig.work.excludedDates
    },
    leaveEntries
  );
}

function extraHolidayDatesFromConfig(work: (typeof config)["work"]): string[] {
  return work.extraHolidayDates.length ? work.extraHolidayDates : work.holidayDates;
}

async function loadDetailsFromData(dataPath: string, yearMonth: string): Promise<ResolvedWorkDetail[]> {
  const raw = JSON.parse(await readFile(dataPath, "utf8"));
  if (Array.isArray(raw) && raw.every((item) => item?.schemaVersion === 1)) {
    const records = raw.map((item) => SupDailyRecordSchema.parse(item));
    return resolveMonthlyWorkDetails(yearMonth, records, {
      workingDays: config.work.workingDays,
      holidayDates: config.work.holidayDates,
      excludedDates: config.work.excludedDates
    });
  }

  if (Array.isArray(raw)) {
    return raw.map((item) => ({
      date: String(item.date),
      detail: String(item.detail),
      source: item.source ?? "same-report-today"
    }));
  }

  return Object.entries(raw).map(([date, detail]) => ({
    date,
    detail: Array.isArray(detail) ? detail.join("\n") : String(detail),
    source: "same-report-today"
  }));
}

function formatOvertimeResult(result: { applied: boolean; reason?: string; filledCount: number; skippedCount: number }): string {
  if (result.applied) {
    const overflow =
      result.skippedCount > 0 ? ` (${result.skippedCount} entries skipped because the sheet is full)` : "";
    return `Overtime sheet: filled ${result.filledCount} row(s)${overflow}`;
  }
  if (result.reason === "no-overtime-sheet") return "Overtime sheet: skipped (template has no Overtime Hours sheet)";
  if (result.reason === "no-overtime-entries") return "Overtime sheet: removed (no overtime entries for this month)";
  if (result.reason === "no-capacity") return "Overtime sheet: skipped (no available rows in template)";
  return "Overtime sheet: skipped";
}
