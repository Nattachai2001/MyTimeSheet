import { parseArgs, requireStringArg } from "../shared/args.js";
import { inspectTemplate, printInspection } from "../timesheet/template-inspector.js";

const args = parseArgs();
const templatePath = requireStringArg(args, "template");
const inspection = await inspectTemplate(templatePath);
console.log(printInspection(inspection));
