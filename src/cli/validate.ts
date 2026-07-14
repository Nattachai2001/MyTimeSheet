import { loadConfig } from "../config/env.js";
import { parseArgs, requireStringArg } from "../shared/args.js";
import { resolveTimesheetOutputPath } from "../timesheet/output-path.js";
import { validateWorkbook } from "../timesheet/timesheet-validator.js";

const args = parseArgs();
const config = await loadConfig();
const month = requireStringArg(args, "month");
const workbook = requireStringArg(
  args,
  "workbook",
  resolveTimesheetOutputPath({
    rootDirectory: config.storage.rootDirectory,
    month,
    site: config.timesheet.site,
    staffName: config.timesheet.staffName,
    extension: "xlsx"
  })
);

const summary = await validateWorkbook(workbook, month, config);
console.log(`Timesheet Validation - ${month}`);
console.log(`Expected working days: ${summary.expectedWorkingDays}`);
console.log(`Completed days: ${summary.completedDays}`);
console.log(`Missing days: ${summary.missingDays.length}`);
if (summary.missingDays.length) console.log(summary.missingDays.join(", "));
console.log(`Excel opens: ${summary.workbookOpens ? "Yes" : "No"}`);
