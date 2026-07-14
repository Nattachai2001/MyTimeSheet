import { existsSync } from "node:fs";
import path from "node:path";

import { templateFilenameForMonth } from "./template-filename.js";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function resolveTemplatePathForMonth(options: {
  month: string;
  templateFolder?: string;
  templatePath?: string;
  rootDirectory: string;
  configuredFilename?: string;
  cwd?: string;
}): string {
  const [year, monthText] = options.month.split("-");
  const monthNumber = Number(monthText);
  const shortMonth = monthNames[monthNumber - 1];
  const templateFolder = options.templateFolder ?? path.join(options.rootDirectory, "templates");
  const cwd = options.cwd ?? process.cwd();
  const configuredFilename = options.configuredFilename;

  const candidates = [
    path.join(templateFolder, `${options.month}.xlsx`),
    shortMonth ? path.join(templateFolder, `${shortMonth} ${year}.xlsx`) : undefined,
    shortMonth ? path.join(templateFolder, templateFilenameForMonth(options.month)) : undefined,
    path.join(templateFolder, "default.xlsx"),
    options.templatePath,
    configuredFilename ? path.join(options.rootDirectory, "templates", configuredFilename) : undefined,
    configuredFilename ? path.join(cwd, "templates", configuredFilename) : undefined
  ].filter(Boolean) as string[];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Template not found for ${options.month}. Checked: ${candidates.join(", ")}`);
  return path.resolve(found);
}
