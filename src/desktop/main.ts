import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, readFileSync, watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { loadConfig, AppConfig } from "../config/env.js";
import { todayBangkok, previousMonthBangkok, currentMonthBangkok, monthDates, nowBangkokHHMM, isLastDayOfMonthBangkok } from "../shared/date.js";
import { saveManualEntry } from "../entry/manual-record.js";
import { importSupExportFile } from "../standup/sup-export-importer.js";
import { DailyRecordRepository } from "../storage/daily-record-repository.js";
import { OvertimeRecordRepository } from "../storage/overtime-record-repository.js";
import { LeaveRecordRepository } from "../storage/leave-record-repository.js";
import { isWorkingDate, WorkCalendar } from "../timesheet/date-resolver.js";
import { resolveMonthTimesheetDetails } from "../timesheet/leave-resolver.js";
import { LeaveTypeSchema } from "../timesheet/leave-types.js";
import { OvertimeEntrySchema } from "../timesheet/overtime-types.js";
import { generateTimesheet } from "../timesheet/excel-generator.js";
import { resolveTemplatePathForMonth } from "../timesheet/template-resolver.js";
import { resolveTimesheetOutputPath } from "../timesheet/output-path.js";
import { exportWorkbookToPdf } from "../timesheet/pdf-exporter.js";
import { buildMonthPreviewRows } from "../timesheet/preview-rows.js";
import { validateWorkbook } from "../timesheet/timesheet-validator.js";
import { SupDailyRecordSchema } from "../storage/schemas.js";
import {
  detectGoogleDrive,
  getGoogleDriveSyncStatus,
  listGoogleDriveAccounts,
  GOOGLE_DRIVE_DOWNLOAD_URL
} from "./google-drive.js";
import {
  defaultHolidayYears,
  getThaiPublicHolidaysForYear,
  yearsForMonth
} from "../holidays/thai-public-holidays.js";
import { getHolidayTitlesForMonth } from "../holidays/holiday-index.js";
import { prefetchThaiPublicHolidays, resolveWorkHolidayDates } from "../holidays/resolve-work-holidays.js";
import { shouldShowMonthEndReminder } from "../reminders/month-end-eligibility.js";
import { checkForUpdate, type UpdateCheckResult, type UpdateConfig } from "./update-check.js";

const execFileAsync = promisify(execFile);

interface DesktopSettings {
  displayName: string;
  staffName: string;
  site: string;
  storageRoot: string;
  templateFolder: string;
  templatePath?: string;
  reminderTime: string;
  startAtLogin: boolean;
  workingDays: number[];
  extraHolidayDates: string[];
  disabledThaiHolidaySlugs: string[];
  holidayDates?: string[];
  customTags?: string[];
  setupComplete?: boolean;
  storageProvider?: "local" | "google-drive";
  hasSeenTrayHint?: boolean;
}

const DEFAULT_ENTRY_TAGS = ["Meeting", "Testing", "Develop", "Migrate", "Design"] as const;

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let lastReminderKey = "";
let lastMonthEndReminderKey = "";
let storageWatcher: FSWatcher | undefined;
let storageWatchRoot = "";
let storageChangeTimer: NodeJS.Timeout | undefined;
let storageNotifyTimer: NodeJS.Timeout | undefined;

const MONTH_END_REMINDER_TIME = "10:30";
let isQuitting = false;

const rendererDir = path.join(app.getAppPath(), "desktop", "renderer");
const assetsDir = path.join(app.getAppPath(), "desktop", "assets");

function appIconPath(): string {
  return path.join(assetsDir, "app-icon.png");
}

function loadAppIcon(size?: number): Electron.NativeImage {
  const image = nativeImage.createFromPath(appIconPath());
  if (image.isEmpty()) return image;
  return size ? image.resize({ width: size, height: size }) : image;
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await ensureSettings();
  await maybeReconnectGoogleDriveAfterAccountChange();
  const settings = await ensureActiveStorageLayout(await readSettings());
  const startHidden = shouldStartHidden();
  createWindow({ show: !startHidden });
  createTray();
  startReminderLoop();
  watchStorageRoot(settings.storageRoot);
  void prefetchThaiPublicHolidays(settings.storageRoot).catch(() => undefined);
  applyLoginItemSettings(settings.startAtLogin);
  if (startHidden && tray) {
    tray.displayBalloon({
      title: "Sup Timesheet Automation",
      content: "Running in the background. Double-click the tray icon to open."
    });
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  // Keep the tray app alive on Windows. The close event handles hide-to-tray.
});

function shouldStartHidden(): boolean {
  if (process.argv.includes("--hidden")) return true;
  try {
    return Boolean(app.getLoginItemSettings().wasOpenedAsHidden);
  } catch {
    return false;
  }
}

function applyLoginItemSettings(startAtLogin: boolean): void {
  app.setLoginItemSettings(
    startAtLogin
      ? {
          openAtLogin: true,
          openAsHidden: true,
          args: ["--hidden"]
        }
      : {
          openAtLogin: false,
          openAsHidden: false,
          args: []
        }
  );
}

function createWindow(options: { show?: boolean } = {}): void {
  const show = options.show !== false;
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 860,
    minHeight: 640,
    title: "Sup Timesheet Automation",
    icon: loadAppIcon(256),
    frame: false,
    show,
    backgroundColor: "#edf1f7",
    webPreferences: {
      preload: path.join(app.getAppPath(), "desktop", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (!show) {
    mainWindow.setSkipTaskbar(true);
  }

  mainWindow.on("focus", () => {
    notifyStorageChanged("focus");
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    void (async () => {
      const showedHint = await showTrayHintIfNeeded();
      if (showedHint) {
        setTimeout(() => mainWindow?.hide(), 900);
        return;
      }
      mainWindow?.hide();
    })();
  });

  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  void mainWindow.loadFile(path.join(rendererDir, "index.html"));
}

function createTray(): void {
  const icon = loadAppIcon(16);
  if (icon.isEmpty()) {
    tray = new Tray(
      nativeImage.createFromDataURL(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPElEQVR4AWP4//8/AyUYTFhYGIb///8zMjIyMgCxQZgYkOaBbBBlAKMGDkHTgLQFJIbRZAjNwMDAwAAAb/0QHfYyq3QAAAAASUVORK5CYII="
      )
    );
  } else {
    tray = new Tray(icon);
  }
  tray.setToolTip("Sup Timesheet Automation");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open", click: () => showWindow() },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
  tray.on("double-click", () => showWindow());
}

function showWindow(): void {
  if (!mainWindow) createWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setSkipTaskbar(false);
  mainWindow.setMinimumSize(860, 640);
  mainWindow.setSize(980, 760);
  mainWindow.center();
  mainWindow?.show();
  mainWindow?.focus();
}

async function showTrayHintIfNeeded(): Promise<boolean> {
  const settings = await readSettings();
  if (settings.hasSeenTrayHint) return false;

  const updated = normalizeSettings({
    ...settings,
    hasSeenTrayHint: true
  });
  await writeSettings(updated);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("app:tray-hint");
  }
  if (tray) {
    tray.displayBalloon({
      title: "Sup Timesheet Automation",
      content: "App minimized to tray. Double-click the icon to reopen."
    });
  }
  return true;
}

function showReminderDrawer(): void {
  if (!mainWindow) createWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = display.workArea;
  const width = Math.min(520, Math.max(460, Math.floor(workArea.width * 0.3)));
  const height = Math.min(680, workArea.height - 40);
  const x = workArea.x + workArea.width - width - 16;
  const y = workArea.y + workArea.height - height - 16;
  const startY = workArea.y + workArea.height + 8;

  mainWindow.setMinimumSize(420, 620);
  mainWindow.setBounds({ x, y: startY, width, height }, false);
  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setSkipTaskbar(true);
  mainWindow.showInactive();
  mainWindow.flashFrame(true);
  animateWindowBounds(mainWindow, { x, y: startY, width, height }, { x, y, width, height }, 280);
}

function animateWindowBounds(
  window: BrowserWindow,
  from: Electron.Rectangle,
  to: Electron.Rectangle,
  durationMs: number
): void {
  const startedAt = Date.now();
  const tickMs = 1000 / 60;

  const timer = setInterval(() => {
    if (window.isDestroyed()) {
      clearInterval(timer);
      return;
    }

    const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    window.setBounds(
      {
        x: Math.round(from.x + (to.x - from.x) * eased),
        y: Math.round(from.y + (to.y - from.y) * eased),
        width: Math.round(from.width + (to.width - from.width) * eased),
        height: Math.round(from.height + (to.height - from.height) * eased)
      },
      false
    );

    if (progress >= 1) clearInterval(timer);
  }, tickMs);
}

function showMonthEndReminder(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.webContents.send("timesheet:month-end-reminder");
  }

  showReminderDrawer();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.flashFrame(true);
  }

  if (tray) {
    tray.displayBalloon({
      title: "Month-end Timesheet Reminder",
      content: "Today is the last day of the month. Don't forget to import your timesheet from Sup!"
    });
  }
}

function startReminderLoop(): void {
  setInterval(async () => {
    const settings = await readSettings();
    const today = todayBangkok();
    const hhmm = nowBangkokHHMM();
    const dailyKey = `${today}-${hhmm}`;

    if (hhmm === settings.reminderTime && lastReminderKey !== dailyKey) {
      lastReminderKey = dailyKey;
      showReminderDrawer();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("entry:reminder", today);
      }
    }

    const monthEndKey = `${today}-${hhmm}`;
    if (
      hhmm === MONTH_END_REMINDER_TIME &&
      isLastDayOfMonthBangkok(today) &&
      lastMonthEndReminderKey !== monthEndKey
    ) {
      lastMonthEndReminderKey = monthEndKey;
      const month = today.slice(0, 7);
      const config = await buildConfig(month);
      const records = await new DailyRecordRepository(config.storage.rootDirectory).readMonth(month);
      if (shouldShowMonthEndReminder(records, month, today)) {
        showMonthEndReminder();
      }
    }
  }, 20_000);
}

ipcMain.handle("reminder:test-month-end", () => {
  showMonthEndReminder();
});

function readUpdateConfig(): UpdateConfig {
  try {
    const packagePath = path.join(app.getAppPath(), "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      timesheetUpdate?: UpdateConfig;
    };
    const config = packageJson.timesheetUpdate ?? {};
    return {
      provider: config.provider ?? (config.manifestUrl ? "manifest" : "github"),
      manifestUrl: config.manifestUrl?.trim(),
      owner: config.owner?.trim(),
      repo: config.repo?.trim()
    };
  } catch {
    return {};
  }
}

ipcMain.handle("update:get-version", () => app.getVersion());

ipcMain.handle("update:check", async (): Promise<UpdateCheckResult> => {
  return checkForUpdate(app.getVersion(), readUpdateConfig());
});

ipcMain.handle("update:open-download", async (_event, downloadUrl: string) => {
  const url = downloadUrl.trim();
  if (!url) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle("settings:get", async () => ensureActiveStorageLayout(await readSettings()));
ipcMain.handle("settings:save", async (_event, settings: DesktopSettings) => {
  const previous = await readSettings();
  const normalized = normalizeSettings(settings);
  if (normalized.storageRoot) {
    normalized.templateFolder = await ensureAppStorageLayout(
      normalized.storageRoot,
      previous.templateFolder
    );
  }
  await writeSettings(normalized);
  applyLoginItemSettings(normalized.startAtLogin);
  watchStorageRoot(normalized.storageRoot);
  return normalized;
});

ipcMain.handle("dialog:choose-directory", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  return result.canceled ? undefined : result.filePaths[0];
});

ipcMain.handle("dialog:choose-template", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? undefined : result.filePaths[0];
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("standup:import", async () => {
  const picked = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Sup! Export", extensions: ["xlsx"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (picked.canceled || !picked.filePaths[0]) {
    return { canceled: true as const };
  }

  const config = await buildConfig(todayBangkok().slice(0, 7));
  try {
    const result = await importSupExportFile({
      filePath: picked.filePaths[0],
      rootDirectory: config.storage.rootDirectory,
      displayName: config.slack.displayName,
      workspaceUrl: config.slack.workspaceUrl,
      channelUrl: config.slack.channelUrl
    });

    return {
      canceled: false as const,
      filePath: picked.filePaths[0],
      ...result
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to import Sup! export: ${message}`);
  }
});

ipcMain.handle("entry:today", () => todayBangkok());
ipcMain.handle("entry:load", async (_event, date: string) => {
  const config = await buildConfig(date.slice(0, 7));
  const repository = new DailyRecordRepository(config.storage.rootDirectory);
  const filePath = repository.inboxPathFor(date, config.slack.displayName);
  if (!existsSync(filePath)) return undefined;
  const record = SupDailyRecordSchema.parse(JSON.parse(await fs.readFile(filePath, "utf8")));
  return {
    date: record.reportDate,
    yesterday: record.content.yesterdayRaw,
    today: record.content.todayRaw,
    yesterdayItems: record.content.yesterdayItems,
    todayItems: record.content.todayItems,
    updatedAt: record.updatedAt,
    filePath
  };
});
ipcMain.handle("entry:save", async (_event, payload: { date: string; yesterday: string; today: string }) => {
  const config = await buildConfig(payload.date.slice(0, 7));
  return saveManualEntry(config, {
    reportDate: payload.date,
    yesterdayRaw: payload.yesterday,
    todayRaw: payload.today
  });
});

ipcMain.handle("entry:month-summary", async (_event, month: string) => {
  const config = await buildConfig(month);
  const settings = await readSettings();
  const calendar = workCalendarFromConfig(config);
  const repository = new DailyRecordRepository(config.storage.rootDirectory);
  const leaveRepository = new LeaveRecordRepository(config.storage.rootDirectory);
  const records = await repository.readMonth(month);
  const leaveEntries = await leaveRepository.readMonth(month);
  const recordDates = new Set(records.map((record) => record.reportDate));
  const leaveByDate = new Map(leaveEntries.map((entry) => [entry.date, entry]));
  const holidayTitlesByDate = await getHolidayTitlesForMonth(
    settings.storageRoot,
    month,
    settings.disabledThaiHolidaySlugs,
    settings.extraHolidayDates
  );

  return monthDates(month).map((date) => {
    const holidayTitles = holidayTitlesByDate.get(date) ?? [];
    const isHoliday = config.work.holidayDates.includes(date);
    const isWorking = isWorkingDate(date, calendar);
    const leave = leaveByDate.get(date);
    let status:
      | "saved"
      | "pending"
      | "weekend"
      | "holiday"
      | "annual-leave"
      | "sick-leave" = "pending";
    if (isHoliday) status = "holiday";
    else if (!isWorking) status = "weekend";
    else if (leave?.type === "annual") status = "annual-leave";
    else if (leave?.type === "sick") status = "sick-leave";
    else if (recordDates.has(date)) status = "saved";
    return {
      date,
      saved: status === "saved",
      status,
      holidayTitles: holidayTitles.length ? holidayTitles : undefined,
      leaveType: leave?.type,
      leaveDetail: leave?.detail
    };
  });
});

ipcMain.handle("leave:load", async (_event, date: string) => {
  const config = await buildConfig(date.slice(0, 7));
  return new LeaveRecordRepository(config.storage.rootDirectory).readEntry(date);
});

ipcMain.handle(
  "leave:save",
  async (
    _event,
    payload: {
      date: string;
      type: string;
      detail?: string;
      halfDay?: boolean;
      halfDayPeriod?: "morning" | "afternoon";
    }
  ) => {
    const config = await buildConfig(payload.date.slice(0, 7));
    const type = LeaveTypeSchema.parse(payload.type);
    const halfDay = type === "sick" ? Boolean(payload.halfDay) : false;
    const halfDayPeriod = halfDay
      ? payload.halfDayPeriod === "afternoon"
        ? "afternoon"
        : "morning"
      : undefined;
    const entry = await new LeaveRecordRepository(config.storage.rootDirectory).saveEntry({
      date: payload.date,
      type,
      detail: payload.detail?.trim() || undefined,
      halfDay: halfDay || undefined,
      halfDayPeriod
    });
    return entry;
  }
);

ipcMain.handle("leave:remove", async (_event, date: string) => {
  const config = await buildConfig(date.slice(0, 7));
  return new LeaveRecordRepository(config.storage.rootDirectory).removeEntry(date);
});

ipcMain.handle("overtime:load-month", async (_event, month: string) => {
  const config = await buildConfig(month);
  return new OvertimeRecordRepository(config.storage.rootDirectory).readMonth(month);
});

ipcMain.handle("overtime:load", async (_event, date: string) => {
  const config = await buildConfig(date.slice(0, 7));
  return new OvertimeRecordRepository(config.storage.rootDirectory).readEntry(date);
});

ipcMain.handle(
  "overtime:save",
  async (
    _event,
    payload: {
      date: string;
      timeIn?: string;
      timeOut?: string;
      includedLunchTime?: "YES" | "NO";
      detail: string;
    }
  ) => {
    const config = await buildConfig(payload.date.slice(0, 7));
    const entry = await new OvertimeRecordRepository(config.storage.rootDirectory).saveEntry(
      OvertimeEntrySchema.parse({
        date: payload.date,
        timeIn: payload.timeIn?.trim() || config.timesheet.defaultOvertimeTimeIn,
        timeOut: payload.timeOut?.trim() || config.timesheet.defaultOvertimeTimeOut,
        includedLunchTime: payload.includedLunchTime ?? config.timesheet.defaultOvertimeLunch,
        detail: payload.detail.trim()
      })
    );
    return entry;
  }
);

ipcMain.handle("overtime:remove", async (_event, date: string) => {
  const config = await buildConfig(date.slice(0, 7));
  return new OvertimeRecordRepository(config.storage.rootDirectory).removeEntry(date);
});

ipcMain.handle("timesheet:preview", async (_event, month: string) => {
  const config = await buildConfig(month);
  const settings = await readSettings();
  const repository = new DailyRecordRepository(config.storage.rootDirectory);
  const records = await repository.readMonth(month);
  const calendar = workCalendarFromConfig(config);
  const leaveEntries = await new LeaveRecordRepository(config.storage.rootDirectory).readMonth(month);
  const details = resolveMonthTimesheetDetails(month, records, calendar, leaveEntries);
  const templatePath = resolveTemplatePathForMonth({
    month,
    templateFolder: settings.templateFolder,
    templatePath: settings.templatePath,
    rootDirectory: config.storage.rootDirectory,
    configuredFilename: config.timesheet.templateFilename
  });
  const filledDates = details.filter((detail) => detail.source !== "missing").map((detail) => detail.date);
  const missingDates = details.filter((detail) => detail.source === "missing").map((detail) => detail.date);
  return {
    month,
    templatePath,
    details,
    rows: buildMonthPreviewRows(month, details, calendar, config),
    filledDates,
    missingDates,
    expectedWorkingDays: details.length
  };
});

ipcMain.handle("timesheet:resolve-template", async (_event, month: string) => {
  const config = await buildConfig();
  const settings = await readSettings();
  const templatePath = resolveTemplatePathForMonth({
    month,
    templateFolder: settings.templateFolder,
    templatePath: settings.templatePath,
    rootDirectory: config.storage.rootDirectory,
    configuredFilename: config.timesheet.templateFilename
  });
  return { month, templatePath };
});

ipcMain.handle("timesheet:validate", async (_event, payload: { month: string; outputPath?: string }) => {
  const config = await buildConfig(payload.month);
  const settings = await readSettings();
  const outputPath =
    payload.outputPath ??
    resolveTimesheetOutputPath({
      rootDirectory: config.storage.rootDirectory,
      month: payload.month,
      site: settings.site,
      staffName: settings.staffName,
      extension: "xlsx"
    });
  if (!existsSync(outputPath)) {
    return {
      outputPath,
      workbookOpens: false,
      expectedWorkingDays: 0,
      completedDays: 0,
      missingDays: [],
      exists: false
    };
  }
  const validation = await validateWorkbook(outputPath, payload.month, config);
  return { outputPath, exists: true, ...validation };
});

ipcMain.handle("timesheet:generate", async (_event, month: string) => {
  const config = await buildConfig(month);
  const repository = new DailyRecordRepository(config.storage.rootDirectory);
  const calendar = workCalendarFromConfig(config);
  const records = await repository.readMonth(month);
  const leaveEntries = await new LeaveRecordRepository(config.storage.rootDirectory).readMonth(month);
  const details = resolveMonthTimesheetDetails(month, records, calendar, leaveEntries);

  const settings = await readSettings();
  const outputPath = resolveTimesheetOutputPath({
    rootDirectory: config.storage.rootDirectory,
    month,
    site: settings.site,
    staffName: settings.staffName,
    extension: "xlsx"
  });
  const pdfPath = resolveTimesheetOutputPath({
    rootDirectory: config.storage.rootDirectory,
    month,
    site: settings.site,
    staffName: settings.staffName,
    extension: "pdf"
  });

  const templatePath = resolveTemplatePathForMonth({
    month,
    templateFolder: settings.templateFolder,
    templatePath: settings.templatePath,
    rootDirectory: config.storage.rootDirectory,
    configuredFilename: config.timesheet.templateFilename
  });

  const result = await generateTimesheet({
    templatePath,
    outputPath,
    month,
    details,
    config,
    overtimeEntries: await new OvertimeRecordRepository(config.storage.rootDirectory).readMonth(month)
  });
  const validation = await validateWorkbook(outputPath, month, config);
  let pdfError: string | undefined;
  try {
    await exportWorkbookToPdf(outputPath, pdfPath);
  } catch (error) {
    pdfError = error instanceof Error ? error.message : String(error);
  }
  return { ...result, validation, templatePath, pdfPath, pdfError };
});

ipcMain.handle("timesheet:previous-month", () => previousMonthBangkok());
ipcMain.handle("timesheet:current-month", () => currentMonthBangkok());
ipcMain.handle("shell:open-path", async (_event, targetPath: string) => {
  if (targetPath) await shell.openPath(targetPath);
});
ipcMain.handle("shell:open-storage", async () => {
  const settings = await readSettings();
  await ensureDirectory(settings.storageRoot);
  await shell.openPath(settings.storageRoot);
});

ipcMain.handle("holidays:get-thai", async (_event, year: number) => {
  const settings = await readSettings();
  return getThaiPublicHolidaysForYear(settings.storageRoot, year);
});

ipcMain.handle("holidays:refresh-thai", async () => {
  const settings = await readSettings();
  const years = defaultHolidayYears();
  const holidays = await Promise.all(
    years.map((entryYear) =>
      getThaiPublicHolidaysForYear(settings.storageRoot, entryYear, { forceRefresh: true })
    )
  );
  return {
    years,
    holidays,
    totalDates: holidays.flatMap((entry) => entry.dates).length
  };
});

ipcMain.handle("cloud:detect-google-drive", async () => detectGoogleDrive());

ipcMain.handle("cloud:list-accounts", async () => listGoogleDriveAccounts());

ipcMain.handle("cloud:get-sync-status", async () => {
  const reconnected = await maybeReconnectGoogleDriveAfterAccountChange();
  const settings = await readSettings();
  const status = await getGoogleDriveSyncStatus(settings.storageRoot, settings.storageProvider ?? "local");
  return { ...status, didReconnect: reconnected, settings: reconnected ? settings : undefined };
});

ipcMain.handle("cloud:open-google-drive-download", async () => {
  await shell.openExternal(GOOGLE_DRIVE_DOWNLOAD_URL);
});

ipcMain.handle("cloud:apply-google-drive", async (_event, syncRootOrPath?: string) => {
  try {
    const accounts = await listGoogleDriveAccounts();
    if (!accounts.length) {
      const detection = await detectGoogleDrive();
      return {
        ok: false as const,
        needsSelection: false,
        accounts,
        detection,
        error: detection.message || "Google Drive folder not found",
        settings: await readSettings()
      };
    }

    const requested = syncRootOrPath?.trim() ? path.normalize(syncRootOrPath.trim()) : "";
    const selected = requested
      ? accounts.find(
          (account) =>
            pathsEqualIgnoreCase(account.syncRoot, requested) ||
            pathsEqualIgnoreCase(account.suggestedDataPath, requested)
        )
      : accounts.length === 1
        ? accounts[0]
        : undefined;

    if (!selected) {
      return {
        ok: false as const,
        needsSelection: true,
        accounts,
        detection: await detectGoogleDrive(),
        error: "Choose which Google Drive account to use",
        settings: await readSettings()
      };
    }

    // Always use the server-resolved data path for the matched account.
    const settings = await applyStorageRoot(await readSettings(), selected.suggestedDataPath, "google-drive");
    watchStorageRoot(settings.storageRoot);
    return {
      ok: true as const,
      needsSelection: false,
      accounts,
      account: selected,
      detection: await detectGoogleDrive(),
      settings
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false as const,
      needsSelection: false,
      accounts: await listGoogleDriveAccounts().catch(() => []),
      detection: await detectGoogleDrive().catch(() => ({
        installed: false,
        accounts: [],
        downloadUrl: GOOGLE_DRIVE_DOWNLOAD_URL,
        message
      })),
      error: message,
      settings: await readSettings()
    };
  }
});

function pathsEqualIgnoreCase(left: string, right: string): boolean {
  return path.resolve(path.normalize(left)).toLowerCase() === path.resolve(path.normalize(right)).toLowerCase();
}

/** Reconnect only when the folder left every active Drive root, and only if one account remains. */
async function maybeReconnectGoogleDriveAfterAccountChange(): Promise<boolean> {
  const current = await readSettings();
  if ((current.storageProvider ?? "local") !== "google-drive") return false;

  const status = await getGoogleDriveSyncStatus(current.storageRoot, "google-drive");
  if (!status.needsReconnect) return false;
  if (status.accounts.length !== 1 || !status.accounts[0]?.suggestedDataPath) return false;

  const settings = await applyStorageRoot(current, status.accounts[0].suggestedDataPath, "google-drive");
  watchStorageRoot(settings.storageRoot);
  return true;
}

ipcMain.handle("cloud:apply-local-storage", async () => {
  const storageRoot = path.join(app.getPath("documents"), "SupTimesheetAutomation");
  const settings = await applyStorageRoot(await readSettings(), storageRoot, "local");
  watchStorageRoot(settings.storageRoot);
  return { ok: true as const, settings };
});

async function buildConfig(month?: string): Promise<AppConfig> {
  const base = await loadConfig(path.join(app.getAppPath(), "config", "config.example.json"));
  const settings = await readSettings();
  base.slack.displayName = settings.displayName;
  base.timesheet.staffName = settings.staffName;
  base.timesheet.site = settings.site;
  base.storage.rootDirectory = settings.storageRoot;
  base.work.workingDays = settings.workingDays;
  base.work.extraHolidayDates = settings.extraHolidayDates;
  const years = month ? yearsForMonth(month) : defaultHolidayYears();
  base.work.holidayDates = await resolveWorkHolidayDates(
    settings.storageRoot,
    settings.extraHolidayDates,
    years,
    settings.disabledThaiHolidaySlugs
  );
  if (settings.templatePath) base.timesheet.templateFilename = path.basename(settings.templatePath);
  base.timesheet.outputFilename = undefined;
  return base;
}

function workCalendarFromConfig(config: AppConfig): WorkCalendar {
  return {
    workingDays: config.work.workingDays,
    holidayDates: config.work.holidayDates,
    excludedDates: config.work.excludedDates
  };
}

async function ensureSettings(): Promise<void> {
  if (existsSync(settingsPath())) return;
  await writeSettings({
    displayName: "",
    staffName: "",
    site: "",
    storageRoot: "",
    templateFolder: "",
    reminderTime: "12:00",
    startAtLogin: true,
    workingDays: [1, 2, 3, 4, 5],
    extraHolidayDates: [],
    disabledThaiHolidaySlugs: [],
    customTags: [],
    setupComplete: false,
    hasSeenTrayHint: false
  });
}

async function readSettings(): Promise<DesktopSettings> {
  await ensureSettings();
  const local = normalizeSettings(
    JSON.parse((await fs.readFile(settingsPath(), "utf8")).replace(/^\uFEFF/, "")) as DesktopSettings
  );

  if (!local.storageRoot?.trim()) return local;

  const cloudSettingsPath = cloudSettingsPathFor(local.storageRoot);
  if (!existsSync(cloudSettingsPath)) return local;

  try {
    const cloud = normalizeSettings(
      JSON.parse((await fs.readFile(cloudSettingsPath, "utf8")).replace(/^\uFEFF/, "")) as DesktopSettings
    );
    return normalizeSettings({
      ...local,
      ...cloud,
      storageRoot: local.storageRoot || cloud.storageRoot,
      templateFolder: cloud.templateFolder || local.templateFolder,
      storageProvider: local.storageProvider || cloud.storageProvider
    });
  } catch {
    return local;
  }
}

async function writeSettings(settings: DesktopSettings): Promise<void> {
  const normalized = normalizeSettings(settings);
  await ensureDirectory(path.dirname(settingsPath()));
  await fs.writeFile(settingsPath(), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  if (normalized.storageRoot) {
    await ensureDirectory(normalized.storageRoot);
    await fs.writeFile(cloudSettingsPathFor(normalized.storageRoot), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  }
}

function isProfileComplete(settings: DesktopSettings): boolean {
  return Boolean(settings.staffName?.trim() && settings.site?.trim());
}

function isStorageConfigured(settings: DesktopSettings): boolean {
  return Boolean(settings.storageRoot?.trim());
}

function isSetupComplete(settings: DesktopSettings): boolean {
  return isStorageConfigured(settings) && isProfileComplete(settings);
}

function normalizeCustomTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const label = String(raw ?? "")
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .trim()
      .replace(/\s+/g, " ");
    if (!label || label.length > 40) continue;
    if (!/^[\p{L}\p{N}][\p{L}\p{N} &_/.-]*$/u.test(label)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    if (DEFAULT_ENTRY_TAGS.some((tag) => tag.toLowerCase() === key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

function normalizeSettings(raw: DesktopSettings): DesktopSettings {
  const storageRoot = raw.storageRoot?.trim() ?? "";
  // App standard: templates always live at {storageRoot}/templates
  const templateFolder = storageRoot ? standardTemplateFolder(storageRoot) : "";

  const normalized: DesktopSettings = {
    ...raw,
    displayName: resolveInternalDisplayName(raw),
    staffName: raw.staffName?.trim() ?? "",
    site: raw.site?.trim() ?? "",
    storageRoot,
    templateFolder,
    workingDays: raw.workingDays ?? [1, 2, 3, 4, 5],
    extraHolidayDates: raw.extraHolidayDates ?? raw.holidayDates ?? [],
    disabledThaiHolidaySlugs: raw.disabledThaiHolidaySlugs ?? [],
    customTags: normalizeCustomTags(raw.customTags),
    storageProvider: raw.storageProvider ?? (storageRoot ? "local" : undefined),
    hasSeenTrayHint: raw.hasSeenTrayHint ?? false
  };
  normalized.setupComplete = isSetupComplete(normalized);
  return normalized;
}

function resolveInternalDisplayName(raw: DesktopSettings): string {
  const existing = raw.displayName?.trim();
  if (existing) return existing;
  const fromStaff = raw.staffName?.trim().split(/\s+/)[0] ?? "";
  return fromStaff || "user";
}

function cloudSettingsPathFor(storageRoot: string): string {
  return path.join(storageRoot, "settings.json");
}

async function readCloudSettingsIfPresent(storageRoot: string): Promise<DesktopSettings | undefined> {
  const cloudPath = cloudSettingsPathFor(storageRoot);
  if (!existsSync(cloudPath)) return undefined;
  try {
    return normalizeSettings(
      JSON.parse((await fs.readFile(cloudPath, "utf8")).replace(/^\uFEFF/, "")) as DesktopSettings
    );
  } catch {
    return undefined;
  }
}

async function applyStorageRoot(
  current: DesktopSettings,
  storageRoot: string,
  storageProvider: DesktopSettings["storageProvider"]
): Promise<DesktopSettings> {
  const templateFolder = await ensureAppStorageLayout(storageRoot, current.templateFolder);
  const cloud = await readCloudSettingsIfPresent(storageRoot);

  const merged: DesktopSettings = {
    ...current,
    ...(cloud ?? {}),
    storageRoot,
    templateFolder,
    storageProvider,
    displayName: current.displayName?.trim() || cloud?.displayName || "",
    staffName: current.staffName?.trim() || cloud?.staffName || "",
    site: current.site?.trim() || cloud?.site || "",
    reminderTime: current.reminderTime || cloud?.reminderTime || "12:00",
    workingDays: current.workingDays?.length ? current.workingDays : cloud?.workingDays ?? [1, 2, 3, 4, 5],
    extraHolidayDates: current.extraHolidayDates?.length
      ? current.extraHolidayDates
      : cloud?.extraHolidayDates ?? [],
    disabledThaiHolidaySlugs: current.disabledThaiHolidaySlugs?.length
      ? current.disabledThaiHolidaySlugs
      : cloud?.disabledThaiHolidaySlugs ?? [],
    customTags: normalizeCustomTags([...(cloud?.customTags ?? []), ...(current.customTags ?? [])])
  };
  const updated = normalizeSettings(merged);
  await writeSettings(updated);
  watchStorageRoot(updated.storageRoot);
  return updated;
}

function notifyStorageChanged(reason = "change"): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (storageNotifyTimer) clearTimeout(storageNotifyTimer);
  storageNotifyTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("storage:changed", { reason, at: new Date().toISOString() });
  }, reason === "focus" ? 50 : 700);
}

function watchStorageRoot(storageRoot: string): void {
  const root = path.normalize(storageRoot || "");
  if (!root) return;
  if (storageWatchRoot === root && storageWatcher) return;

  storageWatcher?.close();
  storageWatcher = undefined;
  storageWatchRoot = root;

  if (!existsSync(root)) {
    void ensureDirectory(root).then(() => watchStorageRoot(root)).catch(() => undefined);
    return;
  }

  try {
    storageWatcher = watch(root, { recursive: true }, (_eventType, filename) => {
      const name = String(filename ?? "");
      if (!name || name.endsWith(".tmp") || name.endsWith("~")) return;
      if (storageChangeTimer) clearTimeout(storageChangeTimer);
      storageChangeTimer = setTimeout(() => notifyStorageChanged("watch"), 800);
    });
    storageWatcher.on("error", () => {
      storageWatcher?.close();
      storageWatcher = undefined;
      storageWatchRoot = "";
    });
  } catch {
    storageWatcher = undefined;
    storageWatchRoot = "";
  }
}

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function standardTemplateFolder(storageRoot: string): string {
  return path.join(storageRoot, "templates");
}

/**
 * App storage standard:
 *   {storageRoot}/
 *     settings.json
 *     templates/   ← month .xlsx always seeded here
 *     inbox/, leave/, overtime/, output/, holidays/
 *
 * When the data folder moves (local ↔ Drive / account switch), missing
 * templates are copied from the previous folder, then filled from the app bundle.
 */
async function ensureAppStorageLayout(
  storageRoot: string,
  previousTemplateFolder?: string
): Promise<string> {
  const root = storageRoot.trim();
  if (!root) return "";

  await ensureDirectory(root);
  for (const name of ["templates", "inbox", "leave", "overtime", "output", "holidays"]) {
    await ensureDirectory(path.join(root, name));
  }

  const templateFolder = standardTemplateFolder(root);
  await seedTemplatesIntoFolder(templateFolder, previousTemplateFolder);
  return templateFolder;
}

async function ensureActiveStorageLayout(settings: DesktopSettings): Promise<DesktopSettings> {
  if (!settings.storageRoot?.trim()) return settings;
  const templateFolder = await ensureAppStorageLayout(settings.storageRoot, settings.templateFolder);
  if (settings.templateFolder === templateFolder) return settings;
  const updated = normalizeSettings({ ...settings, templateFolder });
  await writeSettings(updated);
  return updated;
}

/** Copy missing .xlsx templates from previous folder, then fill gaps from app bundle. */
async function seedTemplatesIntoFolder(
  templateFolder: string,
  previousTemplateFolder?: string
): Promise<void> {
  await ensureDirectory(templateFolder);

  const sources: string[] = [];
  const previous = previousTemplateFolder?.trim();
  if (
    previous &&
    existsSync(previous) &&
    path.normalize(previous) !== path.normalize(templateFolder)
  ) {
    sources.push(previous);
  }

  const bundledTemplateFolder = path.join(app.getAppPath(), "templates");
  if (existsSync(bundledTemplateFolder)) {
    sources.push(bundledTemplateFolder);
  }

  for (const sourceFolder of sources) {
    let filenames: string[] = [];
    try {
      filenames = await fs.readdir(sourceFolder);
    } catch {
      continue;
    }

    // Copy sequentially — Google Drive can hang if many writes race.
    for (const filename of filenames) {
      if (!filename.toLowerCase().endsWith(".xlsx")) continue;
      const source = path.join(sourceFolder, filename);
      const target = path.join(templateFolder, filename);
      if (existsSync(target)) {
        try {
          const stat = await fs.stat(target);
          if (stat.size > 0) continue;
        } catch {
          // replace unreadable stub
        }
      }
      try {
        await withTimeout(fs.copyFile(source, target), 20000, `Timed out copying template ${filename}`);
      } catch {
        // Drive may still be hydrating; skip individual failures
      }
    }
  }
}

/** Node fs.mkdir can hang forever on Google Drive streaming mounts; prefer cmd mkdir on Windows. */
async function ensureDirectory(dir: string): Promise<void> {
  const target = dir.trim();
  if (!target) return;
  if (existsSync(target)) return;

  if (process.platform === "win32") {
    try {
      // Pass the path as its own argv entry so spaces in "My Drive" stay intact.
      await execFileAsync("cmd.exe", ["/c", "mkdir", target], {
        windowsHide: true,
        timeout: 20000
      });
    } catch {
      // Directory may already exist (cmd mkdir exit 1) or be racing — check below.
    }
    if (existsSync(target)) return;
  }

  await withTimeout(
    fs.mkdir(target, { recursive: true }),
    15000,
    `Timed out creating folder: ${target}`
  );
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
