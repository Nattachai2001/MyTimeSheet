import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("timesheetApp", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
  chooseDirectory: () => ipcRenderer.invoke("dialog:choose-directory"),
  chooseTemplate: () => ipcRenderer.invoke("dialog:choose-template"),
  today: () => ipcRenderer.invoke("entry:today"),
  loadEntry: (date: string) => ipcRenderer.invoke("entry:load", date),
  saveEntry: (payload: unknown) => ipcRenderer.invoke("entry:save", payload),
  importSupExport: () => ipcRenderer.invoke("standup:import"),
  loadLeave: (date: string) => ipcRenderer.invoke("leave:load", date),
  saveLeave: (payload: unknown) => ipcRenderer.invoke("leave:save", payload),
  removeLeave: (date: string) => ipcRenderer.invoke("leave:remove", date),
  loadOvertimeMonth: (month: string) => ipcRenderer.invoke("overtime:load-month", month),
  loadOvertime: (date: string) => ipcRenderer.invoke("overtime:load", date),
  saveOvertime: (payload: unknown) => ipcRenderer.invoke("overtime:save", payload),
  removeOvertime: (date: string) => ipcRenderer.invoke("overtime:remove", date),
  monthSummary: (month: string) => ipcRenderer.invoke("entry:month-summary", month),
  monthPreview: (month: string) => ipcRenderer.invoke("timesheet:preview", month),
  resolveTemplate: (month: string) => ipcRenderer.invoke("timesheet:resolve-template", month),
  validateTimesheet: (payload: { month: string; outputPath?: string }) =>
    ipcRenderer.invoke("timesheet:validate", payload),
  previousMonth: () => ipcRenderer.invoke("timesheet:previous-month"),
  currentMonth: () => ipcRenderer.invoke("timesheet:current-month"),
  generateTimesheet: (month: string) => ipcRenderer.invoke("timesheet:generate", month),
  openPath: (targetPath: string) => ipcRenderer.invoke("shell:open-path", targetPath),
  openStorage: () => ipcRenderer.invoke("shell:open-storage"),
  detectGoogleDrive: () => ipcRenderer.invoke("cloud:detect-google-drive"),
  listGoogleDriveAccounts: () => ipcRenderer.invoke("cloud:list-accounts"),
  getCloudSyncStatus: () => ipcRenderer.invoke("cloud:get-sync-status"),
  openGoogleDriveDownload: () => ipcRenderer.invoke("cloud:open-google-drive-download"),
  applyGoogleDriveStorage: (syncRoot?: string) => ipcRenderer.invoke("cloud:apply-google-drive", syncRoot),
  applyLocalStorage: () => ipcRenderer.invoke("cloud:apply-local-storage"),
  getThaiHolidays: (year: number) => ipcRenderer.invoke("holidays:get-thai", year),
  refreshThaiHolidays: () => ipcRenderer.invoke("holidays:refresh-thai"),
  testMonthEndReminder: () => ipcRenderer.invoke("reminder:test-month-end"),
  getAppVersion: () => ipcRenderer.invoke("update:get-version"),
  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  openUpdateDownload: (downloadUrl: string) => ipcRenderer.invoke("update:open-download", downloadUrl),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  onReminder: (callback: (date: string) => void) => {
    ipcRenderer.on("entry:reminder", (_event, date: string) => callback(date));
  },
  onMonthEndReminder: (callback: () => void) => {
    ipcRenderer.on("timesheet:month-end-reminder", () => callback());
  },
  onTrayHint: (callback: () => void) => {
    ipcRenderer.on("app:tray-hint", () => callback());
  },
  onStorageChanged: (callback: (payload: { reason: string; at: string }) => void) => {
    ipcRenderer.on("storage:changed", (_event, payload: { reason: string; at: string }) => callback(payload));
  }
});
