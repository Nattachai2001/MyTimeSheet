const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("timesheetApp", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  chooseDirectory: () => ipcRenderer.invoke("dialog:choose-directory"),
  chooseTemplate: () => ipcRenderer.invoke("dialog:choose-template"),
  today: () => ipcRenderer.invoke("entry:today"),
  loadEntry: (date) => ipcRenderer.invoke("entry:load", date),
  saveEntry: (payload) => ipcRenderer.invoke("entry:save", payload),
  importSupExport: () => ipcRenderer.invoke("standup:import"),
  loadLeave: (date) => ipcRenderer.invoke("leave:load", date),
  saveLeave: (payload) => ipcRenderer.invoke("leave:save", payload),
  removeLeave: (date) => ipcRenderer.invoke("leave:remove", date),
  loadOvertimeMonth: (month) => ipcRenderer.invoke("overtime:load-month", month),
  loadOvertime: (date) => ipcRenderer.invoke("overtime:load", date),
  saveOvertime: (payload) => ipcRenderer.invoke("overtime:save", payload),
  removeOvertime: (date) => ipcRenderer.invoke("overtime:remove", date),
  monthSummary: (month) => ipcRenderer.invoke("entry:month-summary", month),
  monthPreview: (month) => ipcRenderer.invoke("timesheet:preview", month),
  resolveTemplate: (month) => ipcRenderer.invoke("timesheet:resolve-template", month),
  validateTimesheet: (payload) => ipcRenderer.invoke("timesheet:validate", payload),
  previousMonth: () => ipcRenderer.invoke("timesheet:previous-month"),
  currentMonth: () => ipcRenderer.invoke("timesheet:current-month"),
  generateTimesheet: (month) => ipcRenderer.invoke("timesheet:generate", month),
  openPath: (targetPath) => ipcRenderer.invoke("shell:open-path", targetPath),
  openStorage: () => ipcRenderer.invoke("shell:open-storage"),
  detectGoogleDrive: () => ipcRenderer.invoke("cloud:detect-google-drive"),
  listGoogleDriveAccounts: () => ipcRenderer.invoke("cloud:list-accounts"),
  getCloudSyncStatus: () => ipcRenderer.invoke("cloud:get-sync-status"),
  openGoogleDriveDownload: () => ipcRenderer.invoke("cloud:open-google-drive-download"),
  applyGoogleDriveStorage: (syncRoot) => ipcRenderer.invoke("cloud:apply-google-drive", syncRoot),
  applyLocalStorage: () => ipcRenderer.invoke("cloud:apply-local-storage"),
  getThaiHolidays: (year) => ipcRenderer.invoke("holidays:get-thai", year),
  refreshThaiHolidays: () => ipcRenderer.invoke("holidays:refresh-thai"),
  testMonthEndReminder: () => ipcRenderer.invoke("reminder:test-month-end"),
  getAppVersion: () => ipcRenderer.invoke("update:get-version"),
  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  openUpdateDownload: (downloadUrl) => ipcRenderer.invoke("update:open-download", downloadUrl),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  onReminder: (callback) => {
    ipcRenderer.on("entry:reminder", (_event, date) => callback(date));
  },
  onMonthEndReminder: (callback) => {
    ipcRenderer.on("timesheet:month-end-reminder", () => callback());
  },
  onTrayHint: (callback) => {
    ipcRenderer.on("app:tray-hint", () => callback());
  },
  onStorageChanged: (callback) => {
    ipcRenderer.on("storage:changed", (_event, payload) => callback(payload));
  }
});
