import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { normalizePath } from "../shared/files.js";

const ConfigSchema = z.object({
  slack: z.object({
    workspaceUrl: z.string().url(),
    channelUrl: z.string().url(),
    displayName: z.string().min(1),
    supBotName: z.string().min(1).default("Sup!")
  }),
  work: z.object({
    timezone: z.literal("Asia/Bangkok").default("Asia/Bangkok"),
    defaultTimeIn: z.string().default("09:00"),
    defaultTimeOut: z.string().default("18:00"),
    includedLunchTime: z.string().default("YES"),
    workingDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
    holidayDates: z.array(z.string()).default([]),
    extraHolidayDates: z.array(z.string()).default([]),
    disabledThaiHolidaySlugs: z.array(z.string()).default([]),
    excludedDates: z.array(z.string()).default([])
  }),
  storage: z.object({
    rootDirectory: z.string().default("./data")
  }),
  timesheet: z.object({
    staffName: z.string().min(1),
    site: z.string().default("Skilllane"),
    taskCode: z.string().default("W1 - Test Execution"),
    holidayTaskCode: z.string().default("H1 - Holiday"),
    annualLeaveTaskCode: z.string().default("L1 - Annual Leave"),
    sickLeaveTaskCode: z.string().default("L2 - Sick Leave"),
    role: z.string().default("Junior QA Consult"),
    overtimeTaskCode: z.string().optional(),
    defaultOvertimeTimeIn: z.string().default("18:00"),
    defaultOvertimeTimeOut: z.string().default("20:00"),
    defaultOvertimeLunch: z.enum(["YES", "NO"]).default("NO"),
    templateFilename: z.string().default("7. Jul 2026 - TimeSheet_Template - Skilllane.xlsx"),
    outputFilename: z.string().optional()
  }),
  browser: z
    .object({
      headless: z.boolean().default(true),
      profileDirectory: z.string().default("./auth/slack-profile"),
      channel: z.enum(["chrome", "msedge"]).optional(),
      cdpUrl: z.string().url().optional()
    })
    .default({ headless: true, profileDirectory: "./auth/slack-profile" })
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(configPath = process.env.SUP_TIMESHEET_CONFIG): Promise<AppConfig> {
  const candidate = configPath ?? "./config/config.local.json";
  const fallback = "./config/config.example.json";
  const resolved = existsSync(candidate) ? candidate : fallback;
  const raw = JSON.parse(await readFile(resolved, "utf8"));
  const config = ConfigSchema.parse(raw);

  if (process.env.SUP_STORAGE_ROOT) {
    config.storage.rootDirectory = process.env.SUP_STORAGE_ROOT;
  }
  if (process.env.SUP_SLACK_CHANNEL_URL) {
    config.slack.channelUrl = process.env.SUP_SLACK_CHANNEL_URL;
  }

  config.storage.rootDirectory = normalizePath(config.storage.rootDirectory);
  config.browser.profileDirectory = normalizePath(config.browser.profileDirectory);
  config.timesheet.templateFilename = path.normalize(config.timesheet.templateFilename);
  return config;
}
