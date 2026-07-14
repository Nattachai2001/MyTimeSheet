import { existsSync } from "node:fs";
import path from "node:path";

import { AppConfig } from "../config/env.js";
import { buildMonthlyTemplate } from "./monthly-template-builder.js";
import { resolveMasterTemplatePath } from "./master-template.js";
import { templateFilenameForMonth } from "./template-filename.js";

export interface EnsureTemplateOptions {
  month: string;
  config: AppConfig;
  templateFolder: string;
  configuredFilename?: string;
  bundledTemplateFolder?: string;
  cwd?: string;
}

export function expectedTemplatePathForMonth(templateFolder: string, month: string): string {
  return path.join(templateFolder, templateFilenameForMonth(month));
}

export async function ensureTemplateForMonth(options: EnsureTemplateOptions): Promise<{
  templatePath: string;
  created: boolean;
}> {
  const outputPath = expectedTemplatePathForMonth(options.templateFolder, options.month);

  if (existsSync(outputPath)) {
    return { templatePath: path.resolve(outputPath), created: false };
  }

  const masterPath = resolveMasterTemplatePath({
    templateFolder: options.templateFolder,
    rootDirectory: options.config.storage.rootDirectory,
    configuredFilename: options.configuredFilename ?? options.config.timesheet.templateFilename,
    cwd: options.cwd,
    bundledTemplateFolder: options.bundledTemplateFolder
  });

  await buildMonthlyTemplate({
    masterPath,
    outputPath,
    month: options.month,
    config: options.config
  });

  return { templatePath: path.resolve(outputPath), created: true };
}
