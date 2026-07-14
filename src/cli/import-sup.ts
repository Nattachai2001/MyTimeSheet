import path from "node:path";

import { loadConfig } from "../config/env.js";
import { parseArgs, requireStringArg } from "../shared/args.js";
import { todayBangkok } from "../shared/date.js";
import { importSupExportFile } from "../standup/sup-export-importer.js";

const args = parseArgs();
const filePath = path.resolve(requireStringArg(args, "file"));
const config = await loadConfig(typeof args.month === "string" ? args.month : todayBangkok().slice(0, 7));

const result = await importSupExportFile({
  filePath,
  rootDirectory: config.storage.rootDirectory,
  displayName: config.slack.displayName,
  workspaceUrl: config.slack.workspaceUrl,
  channelUrl: config.slack.channelUrl
});

console.log(`Imported ${result.imported} standup day(s) from ${path.basename(filePath)}`);
if (result.followupName) console.log(`Followup: ${result.followupName}`);
if (result.exportUserName) console.log(`Export user: ${result.exportUserName}`);
console.log(`Created: ${result.created}, updated: ${result.updated}, unchanged: ${result.unchanged}, conflicts: ${result.conflicts}, skipped: ${result.skipped}`);
if (result.months.length) console.log(`Months: ${result.months.join(", ")}`);
if (result.dates.length) console.log(`Dates: ${result.dates.join(", ")}`);
