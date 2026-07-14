import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_MASTER_FILENAME = "7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx";

export function resolveMasterTemplatePath(options: {
  templateFolder?: string;
  rootDirectory: string;
  configuredFilename?: string;
  cwd?: string;
  bundledTemplateFolder?: string;
}): string {
  const cwd = options.cwd ?? process.cwd();
  const configured = options.configuredFilename ?? DEFAULT_MASTER_FILENAME;
  const templateFolder = options.templateFolder ?? path.join(options.rootDirectory, "templates");

  const candidates = [
    path.join(templateFolder, configured),
    path.join(cwd, "templates", configured),
    options.bundledTemplateFolder ? path.join(options.bundledTemplateFolder, configured) : undefined,
    path.join(templateFolder, DEFAULT_MASTER_FILENAME),
    path.join(cwd, "templates", DEFAULT_MASTER_FILENAME),
    options.bundledTemplateFolder ? path.join(options.bundledTemplateFolder, DEFAULT_MASTER_FILENAME) : undefined
  ].filter(Boolean) as string[];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return path.resolve(found);

  if (existsSync(templateFolder)) {
    const bundled = readdirSync(templateFolder).find(
      (filename) => filename.toLowerCase().endsWith(".xlsx") && /timesheet_template/i.test(filename)
    );
    if (bundled) return path.resolve(path.join(templateFolder, bundled));
  }

  throw new Error(
    `Master timesheet template not found. Add ${DEFAULT_MASTER_FILENAME} to ${templateFolder} or templates/.`
  );
}
