const api = window.timesheetApp;

if (!api) {
  const status = document.getElementById("statusText");
  if (status) {
    const label = status.querySelector(".status-label") ?? status;
    label.textContent = "Desktop bridge failed to load. Please reinstall the latest build.";
    status.className = "status-pill error";
    status.dataset.state = "error";
  }
  throw new Error("Desktop bridge failed to load: window.timesheetApp is missing");
}

const state = {
  settings: undefined,
  settingsSnapshot: "",
  settingsAutosaveReady: false,
  settingsAutosaveTimer: null,
  settingsAutosaveInFlight: false,
  settingsAutosaveQueued: false,
  entrySnapshot: "",
  entryLoadedDate: "",
  lastOutputPath: undefined,
  lastPdfPath: undefined,
  activeTagTarget: "todayInput",
  thaiHolidayCache: undefined,
  drivePickerResolve: null,
  updateDismissed: false,
  pendingUpdate: undefined
};

const ids = [
  "statusText",
  "viewTitle",
  "settingsHint",
  "entryDate",
  "todayButton",
  "loadEntryButton",
  "yesterdayInput",
  "todayInput",
  "yesterdayHighlight",
  "todayHighlight",
  "yesterdayCount",
  "todayCount",
  "lastSavedText",
  "tagSummary",
  "saveEntryButton",
  "importSupButton",
  "clearEntryButton",
  "openStorageButton",
  "monthInput",
  "previousMonthButton",
  "refreshSummaryButton",
  "previewButton",
  "validateButton",
  "generateButton",
  "openOutputButton",
  "openPdfButton",
  "generateResult",
  "validationPanel",
  "validationGrid",
  "validationMissingList",
  "templatePathText",
  "templateFileName",
  "templateStatusBadge",
  "outputNameText",
  "previewMeta",
  "previewBody",
  "monthSummary",
  "leaveDateInput",
  "leaveTypeInput",
  "leaveHalfDayField",
  "leaveHalfDayInput",
  "leaveHalfDayPeriodField",
  "leaveDetailInput",
  "saveLeaveButton",
  "clearLeaveButton",
  "hasOvertimeCheckbox",
  "overtimePanel",
  "overtimeFormPanel",
  "overtimeDateInput",
  "overtimeTimeInInput",
  "overtimeTimeOutInput",
  "overtimeLunchInput",
  "overtimeDetailInput",
  "saveOvertimeButton",
  "clearOvertimeButton",
  "overtimeEmptyState",
  "overtimeEntryList",
  "staffNameInput",
  "siteInput",
  "reminderTimeInput",
  "storageRootInput",
  "templatePathInput",
  "holidayDatesInput",
  "thaiHolidayMeta",
  "thaiHolidayBadge",
  "thaiHolidayDropdownButton",
  "thaiHolidayDropdownPanel",
  "thaiHolidaySelectionSummary",
  "thaiHolidayCheckboxList",
  "thaiHolidaySelectAllButton",
  "thaiHolidayClearAllButton",
  "refreshThaiHolidaysButton",
  "chooseStorageButton",
  "chooseTemplateButton",
  "startAtLoginInput",
  "openStorageSettingsButton",
  "settingsAutosaveBadge",
  "setupGateBanner",
  "setupGateTitle",
  "setupGateText",
  "finishSetupButton",
  "tagButtonsDefault",
  "tagButtonsSaved",
  "tagGroupSaved",
  "cloudStorageStatus",
  "cloudStorageDetails",
  "cloudStorageCheckedAt",
  "cloudStorageBadge",
  "cloudSetupPanel",
  "refreshCloudSyncButton",
  "useGoogleDriveButton",
  "downloadGoogleDriveButton",
  "setupModal",
  "setupCard",
  "setupStatus",
  "setupStatusBadge",
  "setupStatusText",
  "setupGoogleDriveButton",
  "setupLocalButton",
  "setupDownloadDriveButton",
  "exportStep",
  "confirmDialog",
  "drivePickerModal",
  "drivePickerList",
  "drivePickerCancel",
  "drivePickerBackdrop",
  "drivePickerConnecting",
  "monthEndAlert",
  "monthEndImportButton",
  "monthEndDismissButton",
  "confirmMessage",
  "confirmOk",
  "confirmCancel",
  "toastStack",
  "updateBanner",
  "updateBannerText",
  "downloadUpdateButton",
  "dismissUpdateButton",
  "appVersionText",
  "checkUpdateButton"
];

const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

document.querySelectorAll("[data-window-action]").forEach((button) => {
  button.addEventListener("click", async () => {
    const action = button.dataset.windowAction;
    if (action === "minimize") await api.minimizeWindow();
    if (action === "maximize") await api.toggleMaximizeWindow();
    if (action === "close") await api.closeWindow();
  });
});

document.addEventListener("click", (event) => {
  const navButton = event.target.closest(".nav-item, .mobile-nav-item");
  if (!navButton?.dataset?.view) return;
  void requestShowView(navButton.dataset.view);
});

el.todayButton.addEventListener("click", async () => {
  el.entryDate.value = await api.today();
  await loadEntryForDate({ force: true });
});

el.entryDate.addEventListener("change", () => loadEntryForDate({ force: true }));

el.loadEntryButton.addEventListener("click", () => loadEntryForDate({ force: true }));

el.yesterdayInput.addEventListener("input", () => {
  updateEntryCounts();
  syncTagHighlights();
});
el.todayInput.addEventListener("input", () => {
  updateEntryCounts();
  syncTagHighlights();
});
el.yesterdayInput.addEventListener("focus", () => {
  state.activeTagTarget = "yesterdayInput";
});
el.todayInput.addEventListener("focus", () => {
  state.activeTagTarget = "todayInput";
});

el.clearEntryButton.addEventListener("click", async () => {
  const confirmed = await confirmAction("Clear all text on this page?");
  if (!confirmed) return;
  el.yesterdayInput.value = "";
  el.todayInput.value = "";
  el.lastSavedText.textContent = "-";
  updateEntryCounts();
  syncTagHighlights();
  captureEntrySnapshot();
  showToast("Entry cleared", "success");
});

el.saveEntryButton.addEventListener("click", saveEntryFromUi);
el.importSupButton?.addEventListener("click", importSupFromUi);

el.openStorageButton.addEventListener("click", () => api.openStorage());
el.openStorageSettingsButton.addEventListener("click", () => api.openStorage());
el.checkUpdateButton?.addEventListener("click", () => {
  void checkForAppUpdate({ notify: true, manual: true });
});
el.downloadUpdateButton?.addEventListener("click", () => {
  void openPendingUpdateDownload();
});
el.dismissUpdateButton?.addEventListener("click", () => {
  state.updateDismissed = true;
  hideUpdateBanner();
});

el.previousMonthButton.addEventListener("click", async () => {
  el.monthInput.value = await api.previousMonth();
  await refreshMonthSummary();
  await refreshOvertimePanel({ resetToggle: true });
  await refreshTemplatePath();
  await loadMonthPreview();
});

el.monthInput.addEventListener("change", async () => {
  await refreshMonthSummary();
  await refreshOvertimePanel({ resetToggle: true });
  await refreshTemplatePath();
  await loadMonthPreview();
});
el.refreshSummaryButton.addEventListener("click", async () => {
  await refreshMonthSummary();
  await refreshTemplatePath();
});
el.previewButton.addEventListener("click", loadMonthPreview);

el.validateButton.addEventListener("click", async () => {
  await runWithStatus("Validating workbook...", async () => {
    const validation = await api.validateTimesheet({
      month: el.monthInput.value,
      outputPath: state.lastOutputPath
    });
    renderValidationPanel(validation);
    if (validation.exists && validation.completedDays === validation.expectedWorkingDays) {
      setStatus("Workbook validation passed", "success");
    } else if (!validation.exists) {
      setStatus("Workbook not found. Generate first or choose another month.", "error");
    } else {
      setStatus(`Validation found ${validation.missingDays.length} issue(s)`, "error");
    }
  });
});

el.generateButton.addEventListener("click", async () => {
  await runWithStatus("Generating timesheet...", async () => {
    const result = await api.generateTimesheet(el.monthInput.value);
    state.lastOutputPath = result.outputPath;
    state.lastPdfPath = result.pdfPath;
    el.openOutputButton.disabled = false;
    el.openPdfButton.disabled = !result.pdfPath || Boolean(result.pdfError);
    updateTemplateDisplay(result.templatePath, true);
    updateExportActions();
    updateOutputNamePreview();
    renderValidationPanel({
      exists: true,
      outputPath: result.outputPath,
      pdfPath: result.pdfPath,
      pdfError: result.pdfError,
      overtime: result.overtime,
      ...result.validation
    });
    el.generateResult.classList.add("hidden");
    await loadMonthPreview();
    if (result.pdfError) {
      setStatus(`Excel generated, but PDF export failed: ${result.pdfError}`, "error");
      return;
    }
    setStatus(result.pdfPath ? "Timesheet and PDF generated" : "Timesheet generated", "success");
    showToast("Timesheet generated", "success");
  });
});

el.openOutputButton.addEventListener("click", async () => {
  if (state.lastOutputPath) await api.openPath(state.lastOutputPath);
});

el.openPdfButton.addEventListener("click", async () => {
  if (state.lastPdfPath) await api.openPath(state.lastPdfPath);
});

el.chooseStorageButton.addEventListener("click", async () => {
  const directory = await api.chooseDirectory();
  if (directory) {
    el.storageRootInput.value = directory;
    scheduleSettingsAutosave();
  }
});

el.chooseTemplateButton.addEventListener("click", async () => {
  const template = await api.chooseTemplate();
  if (template) {
    el.templatePathInput.value = template;
    scheduleSettingsAutosave();
  }
});

el.useGoogleDriveButton?.addEventListener("click", () => applyGoogleDriveFromUi());
el.refreshCloudSyncButton?.addEventListener("click", () => refreshCloudStorageStatus(true));
el.downloadGoogleDriveButton?.addEventListener("click", () => api.openGoogleDriveDownload());
el.setupGoogleDriveButton?.addEventListener("click", () => applyGoogleDriveFromUi());
el.setupLocalButton?.addEventListener("click", applyLocalStorageFromUi);
el.setupDownloadDriveButton?.addEventListener("click", () => api.openGoogleDriveDownload());
el.drivePickerCancel?.addEventListener("click", () => hideDrivePicker(undefined));
el.drivePickerBackdrop?.addEventListener("click", () => hideDrivePicker(undefined));
el.finishSetupButton?.addEventListener("click", () => void finishSetupFromUi());
el.refreshThaiHolidaysButton?.addEventListener("click", refreshThaiHolidaysFromUi);
el.saveLeaveButton?.addEventListener("click", saveLeaveFromUi);
el.clearLeaveButton?.addEventListener("click", clearLeaveFromUi);
el.leaveDateInput?.addEventListener("change", loadLeaveForDate);
el.hasOvertimeCheckbox?.addEventListener("change", updateOvertimeFormVisibility);
el.overtimeDateInput?.addEventListener("change", loadOvertimeForDate);
el.saveOvertimeButton?.addEventListener("click", saveOvertimeFromUi);
el.clearOvertimeButton?.addEventListener("click", clearOvertimeFromUi);
el.leaveTypeInput?.addEventListener("change", handleLeaveTypeChange);
el.leaveHalfDayInput?.addEventListener("change", updateLeaveHalfDayVisibility);
el.thaiHolidayDropdownButton?.addEventListener("click", toggleThaiHolidayDropdown);
el.thaiHolidaySelectAllButton?.addEventListener("click", () => setAllThaiHolidays(true));
el.thaiHolidayClearAllButton?.addEventListener("click", () => setAllThaiHolidays(false));

const workspaceEl = document.querySelector(".workspace");
window.addEventListener("resize", () => {
  if (!el.thaiHolidayDropdownPanel?.classList.contains("hidden")) {
    positionThaiHolidayDropdownPanel();
  }
});
workspaceEl?.addEventListener(
  "scroll",
  () => {
    if (!el.thaiHolidayDropdownPanel?.classList.contains("hidden")) {
      positionThaiHolidayDropdownPanel();
    }
  },
  { passive: true }
);

document.addEventListener("click", (event) => {
  if (
    el.thaiHolidayDropdownPanel?.classList.contains("hidden") ||
    el.thaiHolidayDropdownButton?.contains(event.target) ||
    el.thaiHolidayDropdownPanel?.contains(event.target)
  ) {
    return;
  }
  closeThaiHolidayDropdown();
});

document.querySelectorAll("#settingsView input, #settingsView textarea, #settingsView select").forEach((input) => {
  input.addEventListener("input", scheduleSettingsAutosave);
  input.addEventListener("change", scheduleSettingsAutosave);
});

api.onReminder((date) => {
  el.entryDate.value = date;
  showView("entryView");
  void loadEntryForDate({ force: true });
  setStatus(`Reminder for ${date}`);
});

api.onMonthEndReminder?.(() => {
  showMonthEndAlert();
});

el.monthEndImportButton?.addEventListener("click", () => {
  hideMonthEndAlert();
  void importSupFromUi();
});

el.monthEndDismissButton?.addEventListener("click", hideMonthEndAlert);

api.onTrayHint?.(() => {
  showToast("App minimized to tray · Double-click the icon to reopen", "info", 5200);
});

let storageRefreshTimer;
let storageRefreshInFlight = false;
api.onStorageChanged?.(async (payload) => {
  if (storageRefreshTimer) window.clearTimeout(storageRefreshTimer);
  storageRefreshTimer = window.setTimeout(() => {
    void refreshFromStorageSync();
  }, payload?.reason === "focus" ? 100 : 250);
});

async function refreshFromStorageSync() {
  if (storageRefreshInFlight) return;
  storageRefreshInFlight = true;
  try {
    const previousRoot = state.settings?.storageRoot;
    const previousSnapshot = state.settingsSnapshot;
    state.settings = await api.getSettings();
    const nextSnapshot = normalizedSettingsForCompare(state.settings);
    const storageRootChanged =
      Boolean(state.settings?.storageRoot) && state.settings.storageRoot !== previousRoot;
    const settingsChanged = previousSnapshot !== nextSnapshot;
    const onSettingsView = document.querySelector(".view.active")?.id === "settingsView";
    const editingSettings = onSettingsView && isSettingsDirty();

    // Refresh Settings UI from cloud/local sync, but don't clobber in-progress edits.
    if ((storageRootChanged || settingsChanged) && !editingSettings) {
      fillSettingsForm(state.settings);
      captureSettingsSnapshot();
      updateSettingsAutosaveState("saved");
    }
    updateSetupLock();
    await Promise.all([
      loadEntryForDate({ force: false }),
      refreshMonthSummary(),
      refreshTemplatePath(),
      refreshCloudStorageStatus(false)
    ]);
    if (document.querySelector(".view.active")?.id === "generateView" && el.monthInput?.value) {
      try {
        const preview = await api.monthPreview(el.monthInput.value);
        renderPreviewTable(preview);
      } catch {
        /* ignore preview refresh errors during sync */
      }
    }
  } catch {
    /* ignore transient Drive lock/read errors */
  } finally {
    storageRefreshInFlight = false;
  }
}

init();

window.addEventListener("resize", updateNavIndicator);
document.addEventListener("keydown", handleKeyboardShortcuts);

async function init() {
  window.ModernPickers?.init();
  await runWithStatus("Loading app...", async () => {
    state.settings = await api.getSettings();
    fillSettingsForm(state.settings);
    captureSettingsSnapshot();
    el.entryDate.value = await api.today();
    el.monthInput.value = await api.currentMonth();
    await loadEntryForDate();
    await refreshMonthSummary();
    await refreshOvertimePanel({ resetToggle: true });
    await refreshTemplatePath();
    await refreshCloudStorageStatus();
    await loadThaiHolidayPanel();
    try {
      const preview = await api.monthPreview(el.monthInput.value);
      renderPreviewTable(preview);
    } catch {
      el.previewMeta.textContent = "Preview unavailable until template and data are configured.";
    }
    syncTagHighlights();
    await enforceFirstRunSetup();
    state.settingsAutosaveReady = true;
    updateSettingsAutosaveState("saved");
    updateExportActions();
    setStatus("Ready", "success");
    updateNavIndicator();
    requestAnimationFrame(updateNavIndicator);
    window.ModernPickers?.refreshAll();
    await refreshAppVersionLabel();
    void checkForAppUpdate({ notify: true });
  });
}

function isStorageConfigured(settings = state.settings) {
  return Boolean(settings?.storageRoot?.trim());
}

function isProfileComplete(settings = state.settings) {
  return Boolean(settings?.staffName?.trim() && settings?.site?.trim());
}

function isAppSetupComplete(settings = state.settings) {
  return isStorageConfigured(settings) && isProfileComplete(settings);
}

function profileFromForm() {
  return {
    staffName: el.staffNameInput.value.trim(),
    site: el.siteInput.value.trim()
  };
}

function missingProfileFields(profile = profileFromForm()) {
  const missing = [];
  if (!profile.staffName) missing.push("Staff name");
  if (!profile.site) missing.push("Site");
  return missing;
}

function updateSetupLock() {
  const complete = isAppSetupComplete();
  document.body.classList.toggle("setup-required", !complete);
  document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((tab) => {
    const locked = !complete && tab.dataset.view !== "settingsView";
    tab.classList.toggle("is-locked", locked);
    tab.setAttribute("aria-disabled", locked ? "true" : "false");
  });
  updateSetupGateBanner();
}

function updateSetupGateBanner() {
  const banner = el.setupGateBanner;
  if (!banner) return;

  if (!isStorageConfigured()) {
    banner.classList.add("hidden");
    return;
  }

  if (isAppSetupComplete()) {
    banner.classList.add("hidden");
    return;
  }

  const missing = missingProfileFields(state.settings);
  banner.classList.remove("hidden");
  if (el.setupGateTitle) {
    el.setupGateTitle.textContent = "Complete your profile before using the app";
  }
  if (el.setupGateText) {
    el.setupGateText.textContent = missing.length
      ? `Still needed: ${missing.join(", ")}. Entry and Timesheet stay locked until this is done.`
      : "Fill Staff name and Site. Entry and Timesheet stay locked until this is done.";
  }
}

async function enforceFirstRunSetup() {
  updateSetupLock();
  if (!isStorageConfigured(state.settings)) {
    const detection = await api.detectGoogleDrive();
    const accounts = detection?.accounts ?? [];
    if (detection?.installed && accounts.length === 1 && accounts[0]?.syncRoot) {
      setStatus("Google Drive found — setting data folder...", "loading");
      const result = await api.applyGoogleDriveStorage(accounts[0].syncRoot);
      if (result.ok) {
        state.settings = result.settings;
        fillSettingsForm(state.settings);
        captureSettingsSnapshot();
        updateSettingsAutosaveState("saved");
        updateSetupLock();
        hideSetupModal();
        await refreshCloudStorageStatus();
        showToast("Google Drive folder set automatically", "success", 4200);
        if (!isAppSetupComplete(state.settings)) {
          await requestShowView("settingsView", { force: true });
          el.staffNameInput?.focus();
          setStatus("Finish Staff name and Site in Settings", "idle");
        } else {
          setStatus("Google Drive ready", "success");
        }
        return;
      }
    }
    showSetupModal();
    if (accounts.length > 1) {
      setStatus("Multiple Google Drive accounts found — choose one", "idle");
    }
    return;
  }
  hideSetupModal();
  if (!isAppSetupComplete(state.settings)) {
    await requestShowView("settingsView", { force: true });
    el.staffNameInput?.focus();
    setStatus("Finish setup in Settings first", "idle");
  }
}

async function requestShowView(viewId, options = {}) {
  if (!viewId) return;
  const { force = false } = options;
  if (!force && !isAppSetupComplete() && viewId !== "settingsView") {
    showToast("Finish setup in Settings first", "error", 3200);
    await requestShowView("settingsView", { force: true });
    return;
  }
  const current = document.querySelector(".view.active");
  if (current?.id === "settingsView" && viewId !== "settingsView") {
    await flushSettingsAutosave();
    if (!isAppSetupComplete() && !force) {
      showToast("Finish setup in Settings first", "error", 3200);
      updateSetupLock();
      return;
    }
  }
  showView(viewId);
  updateSetupLock();
}

function showView(viewId) {
  const current = document.querySelector(".view.active");
  const next = document.getElementById(viewId);
  if (!next || current === next) return;

  document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === viewId);
  });
  updateNavIndicator();

  if (current) {
    current.classList.add("leaving");
    current.addEventListener(
      "animationend",
      () => {
        current.classList.remove("active", "leaving");
      },
      { once: true }
    );
  }

  next.classList.add("active", "entering");
  next.addEventListener(
    "animationend",
    () => {
      next.classList.remove("entering");
    },
    { once: true }
  );

  animateTitle(next.dataset.title);

  if (viewId === "settingsView") {
    refreshCloudStorageStatus();
    loadThaiHolidayPanel();
  }
}

function updateNavIndicator() {
  const nav = document.querySelector(".nav");
  const indicator = document.querySelector(".nav-indicator");
  const active = document.querySelector(".nav-item.active");
  if (!nav || !indicator || !active) return;
  indicator.style.top = `${active.offsetTop}px`;
  indicator.style.height = `${active.offsetHeight}px`;
}

function animateTitle(title) {
  el.viewTitle.classList.remove("title-in");
  void el.viewTitle.offsetWidth;
  el.viewTitle.textContent = title;
  el.viewTitle.classList.add("title-in");
}

function entryFormSnapshot() {
  return JSON.stringify({
    date: el.entryDate.value,
    yesterday: el.yesterdayInput.value,
    today: el.todayInput.value
  });
}

function captureEntrySnapshot() {
  state.entrySnapshot = entryFormSnapshot();
  state.entryLoadedDate = el.entryDate.value || "";
}

function isEntryDirty() {
  if (!state.entrySnapshot) return false;
  return entryFormSnapshot() !== state.entrySnapshot;
}

async function loadEntryForDate(options = {}) {
  const { force = false } = options;
  if (!el.entryDate.value) return;

  // Keep in-progress drafts — storage sync / tag learning must not wipe typing.
  if (!force && isEntryDirty() && el.entryDate.value === state.entryLoadedDate) {
    return;
  }

  await runWithStatus(`Loading ${el.entryDate.value}...`, async () => {
    const existing = await api.loadEntry(el.entryDate.value);
    if (!existing) {
      el.yesterdayInput.value = "";
      el.todayInput.value = "";
      el.lastSavedText.textContent = "-";
      updateEntryCounts();
      captureEntrySnapshot();
      syncTagHighlights();
      setStatus(`No saved entry for ${el.entryDate.value}`);
      return;
    }
    el.yesterdayInput.value = existing.yesterday;
    el.todayInput.value = existing.today;
    el.lastSavedText.textContent = formatTime(existing.updatedAt);
    updateEntryCounts();
    captureEntrySnapshot();
    syncTagHighlights();
    setStatus(`Loaded ${el.entryDate.value}`, "success");
  });
}

async function refreshMonthSummary() {
  if (!el.monthInput.value) return;
  const summary = await api.monthSummary(el.monthInput.value);
  const today = await api.today();
  el.monthSummary.innerHTML = "";
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((weekday) => {
    const header = document.createElement("div");
    header.className = "calendar-weekday";
    header.textContent = weekday;
    el.monthSummary.appendChild(header);
  });

  const leadingDays = summary[0] ? getCalendarColumn(summary[0].date) : 0;
  for (let index = 0; index < leadingDays; index += 1) {
    const spacer = document.createElement("div");
    spacer.className = "calendar-spacer";
    el.monthSummary.appendChild(spacer);
  }

  summary.forEach((day) => {
    const status = calendarStatusMeta(day.status);
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "calendar-day",
      day.status === "saved" ? "saved" : day.status === "pending" ? "missing" : "",
      day.status === "weekend" ? "weekend" : "",
      day.status === "holiday" ? "holiday" : "",
      day.status === "annual-leave" ? "annual-leave" : "",
      day.status === "sick-leave" ? "sick-leave" : "",
      day.date === today ? "today" : ""
    ]
      .filter(Boolean)
      .join(" ");
    button.disabled = day.status === "weekend" || day.status === "holiday";
    const holidayLabel = day.holidayTitles?.length ? day.holidayTitles.join(", ") : status.full;
    button.setAttribute("aria-label", `${formatCalendarDate(day.date)} ${holidayLabel}`);
    button.title = holidayLabel;
    button.innerHTML = `
      <span class="date-main">${day.date.slice(8)}</span>
      <span class="date-state">${status.short}</span>
    `;
    if (day.holidayTitles?.length) {
      button.dataset.holiday = day.holidayTitles.join(" · ");
    } else if (day.status === "annual-leave" || day.status === "sick-leave") {
      button.dataset.holiday = day.leaveDetail || status.full;
    }
    if (day.status === "pending" || day.status === "saved") {
      button.addEventListener("click", async () => {
        el.entryDate.value = day.date;
        showView("entryView");
        await loadEntryForDate({ force: true });
      });
    }
    if (day.status === "annual-leave" || day.status === "sick-leave" || day.status === "pending") {
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        fillLeaveForm(day.date);
      });
      button.addEventListener("dblclick", () => fillLeaveForm(day.date));
    }
    if (day.status === "annual-leave" || day.status === "sick-leave") {
      button.addEventListener("click", () => fillLeaveForm(day.date));
    }
    el.monthSummary.appendChild(button);
  });

  el.monthSummary.querySelectorAll(".calendar-day, .calendar-spacer").forEach((node, index) => {
    node.style.setProperty("--stagger", `${Math.min(index * 18, 360)}ms`);
    node.classList.add("stagger-in");
  });
}

function updateEntryCounts() {
  const oldYesterday = el.yesterdayCount.textContent;
  const oldToday = el.todayCount.textContent;
  el.yesterdayCount.textContent = String(countItems(el.yesterdayInput.value));
  el.todayCount.textContent = String(countItems(el.todayInput.value));
  bumpIfChanged(el.yesterdayCount, oldYesterday);
  bumpIfChanged(el.todayCount, oldToday);
}

function countItems(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^added by\b/i.test(line)).length;
}

function fillSettingsForm(settings) {
  el.staffNameInput.value = settings.staffName;
  el.siteInput.value = settings.site;
  el.reminderTimeInput.value = settings.reminderTime;
  el.storageRootInput.value = settings.storageRoot;
  el.templatePathInput.value = settings.templateFolder ?? settings.templatePath;
  el.startAtLoginInput.checked = settings.startAtLogin;
  el.holidayDatesInput.value = (settings.extraHolidayDates ?? settings.holidayDates ?? []).join("\n");
  document.querySelectorAll("[data-weekday]").forEach((input) => {
    input.checked = (settings.workingDays ?? [1, 2, 3, 4, 5]).includes(Number(input.value));
  });
  el.settingsHint.textContent = settings.storageRoot;
  updateOutputNamePreview();
  renderTagButtons(settings.customTags ?? []);
}

function readSettingsForm() {
  const workingDays = [...document.querySelectorAll("[data-weekday]:checked")].map((input) =>
    Number(input.value)
  );
  const extraHolidayDates = el.holidayDatesInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d{4}-\d{2}-\d{2}$/.test(line));
  const profile = profileFromForm();
  const storageRoot = el.storageRootInput.value.trim();
  const staffName = profile.staffName;
  const displayName =
    state.settings?.displayName?.trim() ||
    staffName.split(/\s+/)[0] ||
    "user";

  return {
    displayName,
    staffName,
    site: profile.site,
    reminderTime: el.reminderTimeInput.value || "12:00",
    storageRoot,
    templateFolder: el.templatePathInput.value,
    startAtLogin: el.startAtLoginInput.checked,
    workingDays: workingDays.length ? workingDays : [1, 2, 3, 4, 5],
    extraHolidayDates,
    disabledThaiHolidaySlugs: state.settings?.disabledThaiHolidaySlugs ?? [],
    customTags: state.settings?.customTags ?? [],
    setupComplete: Boolean(storageRoot && staffName && profile.site),
    storageProvider: state.settings?.storageProvider ?? (storageRoot ? "local" : undefined)
  };
}

function normalizedSettingsForCompare(settings) {
  return JSON.stringify({
    staffName: settings.staffName,
    site: settings.site,
    reminderTime: settings.reminderTime,
    storageRoot: settings.storageRoot,
    templateFolder: settings.templateFolder,
    startAtLogin: settings.startAtLogin,
    workingDays: settings.workingDays,
    extraHolidayDates: settings.extraHolidayDates,
    disabledThaiHolidaySlugs: settings.disabledThaiHolidaySlugs ?? [],
    customTags: settings.customTags ?? [],
    storageProvider: settings.storageProvider
  });
}

function captureSettingsSnapshot() {
  state.settingsSnapshot = normalizedSettingsForCompare(readSettingsForm());
}

function isSettingsDirty() {
  if (!state.settingsSnapshot) return false;
  return normalizedSettingsForCompare(readSettingsForm()) !== state.settingsSnapshot;
}

const SETTINGS_AUTOSAVE_DELAY_MS = 650;

function updateSettingsAutosaveState(mode = "idle") {
  const badge = el.settingsAutosaveBadge;
  if (!badge) return;

  badge.classList.remove("pending", "saving", "saved", "error");
  if (mode === "pending") {
    badge.textContent = "Pending save...";
    badge.classList.add("pending");
    return;
  }
  if (mode === "saving") {
    badge.textContent = "Saving...";
    badge.classList.add("saving");
    return;
  }
  if (mode === "saved") {
    badge.textContent = "All changes saved";
    badge.classList.add("saved");
    return;
  }
  if (mode === "error") {
    badge.textContent = "Save failed";
    badge.classList.add("error");
    return;
  }
  badge.textContent = isSettingsDirty() ? "Pending save..." : "All changes saved";
  badge.classList.toggle("pending", isSettingsDirty());
  badge.classList.toggle("saved", !isSettingsDirty());
}

function scheduleSettingsAutosave() {
  if (!state.settingsAutosaveReady) return;
  if (!isSettingsDirty()) {
    updateSettingsAutosaveState("saved");
    return;
  }

  updateSettingsAutosaveState("pending");
  if (state.settingsAutosaveTimer) {
    window.clearTimeout(state.settingsAutosaveTimer);
  }
  state.settingsAutosaveTimer = window.setTimeout(() => {
    state.settingsAutosaveTimer = null;
    void persistSettings({ silent: true });
  }, SETTINGS_AUTOSAVE_DELAY_MS);
}

async function flushSettingsAutosave() {
  if (state.settingsAutosaveTimer) {
    window.clearTimeout(state.settingsAutosaveTimer);
    state.settingsAutosaveTimer = null;
  }
  if (!isSettingsDirty()) return true;
  return persistSettings({ silent: true });
}

async function persistSettings({ silent = false } = {}) {
  if (!isSettingsDirty()) {
    updateSettingsAutosaveState("saved");
    return true;
  }
  if (state.settingsAutosaveInFlight) {
    state.settingsAutosaveQueued = true;
    return false;
  }

  const previousStorageRoot = state.settings?.storageRoot;
  const settings = readSettingsForm();
  state.settingsAutosaveInFlight = true;
  updateSettingsAutosaveState("saving");

  try {
    state.settings = await api.saveSettings(settings);
    fillSettingsForm(state.settings);
    captureSettingsSnapshot();
    updateSettingsAutosaveState("saved");
    el.settingsHint.textContent = state.settings.storageRoot;
    updateSetupLock();

    if (previousStorageRoot !== state.settings.storageRoot) {
      await refreshCloudStorageStatus();
      showToast("Storage moved — templates copied to the new folder", "success", 4500);
    } else {
      showToast("Settings saved", "success", silent ? 2400 : 3200);
    }
    await refreshMonthSummary();
    await refreshTemplatePath();
    await loadMonthPreview();

    if (!silent && previousStorageRoot === state.settings.storageRoot) {
      setStatus("Settings saved", "success");
    } else if (previousStorageRoot !== state.settings.storageRoot) {
      setStatus(`Using ${state.settings.templateFolder}`, "success");
    }
    return true;
  } catch (error) {
    const text = formatIpcError(error);
    updateSettingsAutosaveState("error");
    setStatus(text, "error");
    showToast(text, "error", 6500);
    return false;
  } finally {
    state.settingsAutosaveInFlight = false;
    if (state.settingsAutosaveQueued) {
      state.settingsAutosaveQueued = false;
      if (isSettingsDirty()) scheduleSettingsAutosave();
    }
  }
}

function setStatus(message, type = "") {
  const label = el.statusText.querySelector(".status-label") ?? el.statusText;
  label.textContent = message;
  el.statusText.className = `status-pill ${type}`.trim();
  el.statusText.dataset.state = type || "idle";
  replayAnimation(el.statusText, "bump");
}

function formatIpcError(error) {
  const message = error?.message ?? String(error);
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

async function runWithStatus(message, action) {
  document.body.classList.add("is-busy");
  setStatus(message, "loading");
  try {
    await action();
  } catch (error) {
    const text = formatIpcError(error);
    setStatus(text, "error");
    showToast(text, "error", 6500);
  } finally {
    document.body.classList.remove("is-busy");
  }
}

async function saveEntryFromUi() {
  await runWithStatus("Saving entry...", async () => {
    const result = await api.saveEntry({
      date: el.entryDate.value,
      yesterday: el.yesterdayInput.value,
      today: el.todayInput.value
    });
    el.lastSavedText.textContent = "now";
    updateEntryCounts();
    captureEntrySnapshot();
    syncTagHighlights();
    await learnCustomTagsFromEntry({ silent: false });
    await refreshMonthSummary();
    setStatus(`Saved ${el.entryDate.value}: ${result.fileStatus}`, "success");
    showToast("Entry saved", "success");
  });
}

async function importSupFromUi() {
  await runWithStatus("Importing Sup! export...", async () => {
    const result = await api.importSupExport();
    if (result.canceled) {
      setStatus("Import canceled");
      return;
    }

    if (result.months?.length === 1 && el.monthInput) {
      el.monthInput.value = result.months[0];
    }

    await refreshMonthSummary();
    await refreshTemplatePath();
    await loadMonthPreview();

    const summary = [
      `${result.imported} imported`,
      result.created ? `${result.created} new` : "",
      result.updated ? `${result.updated} updated` : "",
      result.skipped ? `${result.skipped} skipped` : ""
    ]
      .filter(Boolean)
      .join(" · ");

    setStatus(`Sup! import complete: ${summary}`, "success");
    showToast(`Imported ${result.imported} standup day(s)`, "success");
  });
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function parseLocalDate(value) {
  return new Date(`${value}T00:00:00`);
}

function calendarStatusMeta(status) {
  switch (status) {
    case "saved":
      return { short: "OK", full: "Saved" };
    case "annual-leave":
      return { short: "AL", full: "Annual leave" };
    case "sick-leave":
      return { short: "SL", full: "Sick leave" };
    case "holiday":
      return { short: "Hol", full: "Holiday" };
    case "weekend":
      return { short: "—", full: "Off" };
    default:
      return { short: "…", full: "Pending" };
  }
}

function getCalendarColumn(value) {
  return (parseLocalDate(value).getDay() + 6) % 7;
}

function formatCalendarDate(value) {
  return parseLocalDate(value).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "2-digit"
  });
}

function bumpIfChanged(node, previous) {
  if (node.textContent !== previous) replayAnimation(node, "bump");
}

function replayAnimation(node, className) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

async function refreshTemplatePath() {
  if (!el.monthInput.value) return;
  try {
    const result = await api.resolveTemplate(el.monthInput.value);
    updateTemplateDisplay(result.templatePath, true);
    updateOutputNamePreview();
  } catch (error) {
    updateTemplateDisplay(error?.message ?? "Template not found", false);
    updateOutputNamePreview();
  }
}

function updateOutputNamePreview() {
  const settings = state.settings;
  if (!settings || !el.monthInput.value) {
    el.outputNameText.textContent = "-";
    return;
  }
  const period = el.monthInput.value.replace("-", "");
  const base = `${settings.site} - TimeSheet ${period} - ${settings.staffName}`;
  el.outputNameText.textContent = `${base}.xlsx\n${base}.pdf`;
}

async function loadMonthPreview() {
  if (!el.monthInput.value) return;
  await runWithStatus("Loading preview...", async () => {
    const preview = await api.monthPreview(el.monthInput.value);
    updateTemplateDisplay(preview.templatePath, true);
    renderPreviewTable(preview);
    setStatus(
      `Preview ready: ${preview.filledDates.length}/${preview.expectedWorkingDays} working days filled`,
      preview.missingDates.length ? "idle" : "success"
    );
  });
}

function renderPreviewTable(preview) {
  el.previewMeta.textContent = `${preview.filledDates.length} filled, ${preview.missingDates.length} missing out of ${preview.expectedWorkingDays} working days.`;
  el.previewBody.innerHTML = "";

  const rows = preview.rows ?? preview.details ?? [];
  if (!rows.length) {
    el.previewBody.innerHTML = `<tr><td colspan="9" class="preview-empty">No working days in this month.</td></tr>`;
    return;
  }

  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    if (row.isMissing) tr.classList.add("preview-missing-row");

    const taskCode = row.taskCode ?? "";
    const role = row.role ?? "";
    const dateDisplay = row.dateDisplay ?? formatPreviewDate(row.date);
    const timeIn = row.timeIn ?? "";
    const timeOut = row.timeOut ?? "";
    const includedLunch = row.includedLunch ?? "";
    const hours = row.hours ?? "";
    const detail = row.detail ?? "";
    const isMissing = row.isMissing ?? row.source === "missing";

    tr.innerHTML = `
      <td class="excel-row-num">${index + 1}</td>
      <td class="col-task">${escapeHtml(taskCode)}</td>
      <td class="col-role">${escapeHtml(role)}</td>
      <td class="col-date">${escapeHtml(dateDisplay)}</td>
      <td class="col-time">${escapeHtml(timeIn)}</td>
      <td class="col-time">${escapeHtml(timeOut)}</td>
      <td class="col-lunch">${escapeHtml(includedLunch)}</td>
      <td class="col-hours">${escapeHtml(hours)}</td>
      <td class="col-detail ${isMissing ? "cell-missing" : ""}">${escapeHtml(detail)}</td>
    `;
    el.previewBody.appendChild(tr);
  });
}

function renderValidationPanel(validation) {
  el.validationPanel.classList.remove("hidden");
  const passed =
    validation.exists &&
    validation.workbookOpens &&
    validation.completedDays === validation.expectedWorkingDays &&
    validation.missingDays.length === 0;

  el.validationGrid.innerHTML = `
    <div class="validation-card ${validation.exists ? "good" : "bad"}">
      <span>Workbook</span>
      <strong>${validation.exists ? "Found" : "Missing"}</strong>
    </div>
    <div class="validation-card ${validation.workbookOpens ? "good" : "bad"}">
      <span>Opens</span>
      <strong>${validation.workbookOpens ? "Yes" : "No"}</strong>
    </div>
    <div class="validation-card ${passed ? "good" : "bad"}">
      <span>Complete</span>
      <strong>${validation.completedDays ?? 0}/${validation.expectedWorkingDays ?? 0}</strong>
    </div>
    <div class="validation-card ${validation.missingDays?.length ? "bad" : "good"}">
      <span>Issues</span>
      <strong>${validation.missingDays?.length ?? 0}</strong>
    </div>
  `;

  el.validationMissingList.innerHTML = "";
  if (validation.outputPath) {
    const pathItem = document.createElement("li");
    pathItem.textContent = `Excel: ${validation.outputPath}`;
    el.validationMissingList.appendChild(pathItem);
  }
  if (validation.pdfPath) {
    const pdfItem = document.createElement("li");
    pdfItem.textContent = `PDF: ${validation.pdfPath}`;
    el.validationMissingList.appendChild(pdfItem);
  }
  if (validation.pdfError) {
    const pdfErrorItem = document.createElement("li");
    pdfErrorItem.textContent = `PDF export failed: ${validation.pdfError}`;
    el.validationMissingList.appendChild(pdfErrorItem);
  }
  if (validation.overtime) {
    const overtimeItem = document.createElement("li");
    overtimeItem.textContent = formatOvertimeStatus(validation.overtime);
    el.validationMissingList.appendChild(overtimeItem);
  }
  (validation.missingDays ?? []).forEach((date) => {
    const item = document.createElement("li");
    item.textContent = `Missing or incomplete: ${formatPreviewDate(date)}`;
    el.validationMissingList.appendChild(item);
  });
  if (!validation.missingDays?.length && validation.exists) {
    const item = document.createElement("li");
    item.textContent = passed ? "All working days look complete" : "Workbook found but no fully filled rows yet";
    el.validationMissingList.appendChild(item);
  }
  replayAnimation(el.validationPanel, "updated");
}

function insertTag(tag) {
  const textarea = el[state.activeTagTarget];
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const prefix = before && !before.endsWith("\n") ? "\n" : "";
  const insertion = `${prefix}${tag}\n`;
  textarea.value = `${before}${insertion}${after}`;
  const cursor = before.length + insertion.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
  updateEntryCounts();
  syncTagHighlights();
}

const DEFAULT_ENTRY_TAGS = ["Meeting", "Testing", "Develop", "Migrate", "Design"];
let learnCustomTagsTimer = null;
let learnCustomTagsInFlight = false;

function normalizeTagLabel(value) {
  return String(value ?? "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .trim()
    .replace(/\s+/g, " ");
}

function formatTagToken(label) {
  return `[${normalizeTagLabel(label)}]`;
}

function isDefaultEntryTag(label) {
  const key = normalizeTagLabel(label).toLowerCase();
  return DEFAULT_ENTRY_TAGS.some((tag) => tag.toLowerCase() === key);
}

function isLearnableCustomTag(label) {
  const normalized = normalizeTagLabel(label);
  if (!normalized || normalized.length > 40) return false;
  if (isDefaultEntryTag(normalized)) return false;
  return /^[\p{L}\p{N}][\p{L}\p{N} &_/.-]*$/u.test(normalized);
}

function getSavedTagLabels(customTags = state.settings?.customTags ?? []) {
  const labels = [];
  const seen = new Set();
  for (const raw of customTags) {
    const label = normalizeTagLabel(raw);
    if (!label || !isLearnableCustomTag(label)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

function createTagButton(label, { custom = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = custom ? "tag-chip is-custom" : "tag-chip";
  button.dataset.tag = formatTagToken(label);
  button.textContent = label;
  button.addEventListener("click", () => insertTag(button.dataset.tag));
  return button;
}

function renderTagButtons(customTags = state.settings?.customTags ?? []) {
  if (el.tagButtonsDefault) {
    el.tagButtonsDefault.innerHTML = "";
    DEFAULT_ENTRY_TAGS.forEach((label) => {
      el.tagButtonsDefault.appendChild(createTagButton(label));
    });
  }

  const saved = getSavedTagLabels(customTags);
  if (el.tagButtonsSaved) {
    el.tagButtonsSaved.innerHTML = "";
    saved.forEach((label) => {
      el.tagButtonsSaved.appendChild(createTagButton(label, { custom: true }));
    });
  }
  el.tagGroupSaved?.classList.toggle("hidden", saved.length === 0);
}

function collectLearnableTagsFromEntry() {
  const discovered = [];
  const seen = new Set();
  for (const [token] of collectTags(`${el.yesterdayInput.value}\n${el.todayInput.value}`)) {
    const label = normalizeTagLabel(token);
    if (!isLearnableCustomTag(label)) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    discovered.push(label);
  }
  return discovered;
}

function scheduleLearnCustomTagsFromEntry() {
  if (learnCustomTagsTimer) window.clearTimeout(learnCustomTagsTimer);
  learnCustomTagsTimer = window.setTimeout(() => {
    learnCustomTagsTimer = null;
    void learnCustomTagsFromEntry({ silent: true });
  }, 700);
}

async function learnCustomTagsFromEntry({ silent = true } = {}) {
  if (!state.settingsAutosaveReady || !isStorageConfigured(state.settings)) return;
  if (learnCustomTagsInFlight) return;

  const current = state.settings?.customTags ?? [];
  const known = new Set(current.map((tag) => normalizeTagLabel(tag).toLowerCase()));
  const additions = collectLearnableTagsFromEntry().filter((label) => !known.has(label.toLowerCase()));
  if (!additions.length) return;

  learnCustomTagsInFlight = true;
  try {
    const next = [...current, ...additions];
    state.settings = await api.saveSettings({
      ...readSettingsForm(),
      customTags: next
    });
    if (document.querySelector(".view.active")?.id === "settingsView") {
      captureSettingsSnapshot();
      updateSettingsAutosaveState("saved");
    } else {
      state.settingsSnapshot = normalizedSettingsForCompare(state.settings);
    }
    renderTagButtons(state.settings.customTags ?? []);
    if (!silent) {
      showToast(
        additions.length === 1
          ? `Saved reusable tag ${formatTagToken(additions[0])}`
          : `Saved ${additions.length} reusable tags`,
        "success",
        2800
      );
    }
  } catch {
    /* ignore transient save errors while typing */
  } finally {
    learnCustomTagsInFlight = false;
  }
}

function syncTagHighlights() {
  renderTagHighlight(el.yesterdayInput, el.yesterdayHighlight);
  renderTagHighlight(el.todayInput, el.todayHighlight);
  renderTagSummary();
  scheduleLearnCustomTagsFromEntry();
}

function renderTagHighlight(textarea, highlightNode) {
  const escaped = escapeHtml(textarea.value).replace(/\n$/g, "\n ");
  highlightNode.innerHTML = escaped.replace(
    /(\[[^\]]+\])/g,
    '<mark class="tag-mark">$1</mark>'
  );
  highlightNode.scrollTop = textarea.scrollTop;
  highlightNode.scrollLeft = textarea.scrollLeft;
}

function renderTagSummary() {
  const tags = collectTags(`${el.yesterdayInput.value}\n${el.todayInput.value}`);
  if (!tags.length) {
    el.tagSummary.textContent = "No tags yet — use [Meeting] format or tap a button above";
    return;
  }
  el.tagSummary.innerHTML = "";
  tags.forEach(([tag, count]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-count-chip";
    button.title = `Insert ${tag}`;
    button.innerHTML = `${escapeHtml(tag)} <strong>${count}</strong>`;
    button.addEventListener("click", () => insertTag(tag));
    el.tagSummary.appendChild(button);
  });
}

function collectTags(text) {
  const counts = new Map();
  for (const match of text.matchAll(/(\[[^\]]+\])/g)) {
    const tag = match[1];
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function formatPreviewDate(value) {
  return parseLocalDate(value).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "2-digit"
  });
}

function formatSourceLabel(source) {
  if (source === "next-report-yesterday") return "Yesterday field";
  if (source === "same-report-today") return "Today field";
  if (source === "annual-leave") return "Annual leave";
  if (source === "sick-leave") return "Sick leave";
  return "Missing";
}

function formatOvertimeStatus(overtime) {
  if (overtime.applied) {
    const overflow =
      overtime.skippedCount > 0 ? `, ${overtime.skippedCount} skipped because the sheet is full` : "";
    return `Overtime sheet: filled ${overtime.filledCount} row(s)${overflow}`;
  }
  if (overtime.reason === "no-overtime-sheet") return "Overtime sheet: skipped (template has no Overtime Hours sheet)";
  if (overtime.reason === "no-overtime-entries") return "Overtime sheet: removed (no overtime entries for this month)";
  if (overtime.reason === "no-capacity") return "Overtime sheet: skipped (no available rows in template)";
  return "Overtime sheet: skipped";
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function basename(value) {
  return String(value).split(/[\\/]/).pop() || String(value);
}

function updateTemplateDisplay(value, found) {
  const text = value || "-";
  el.templatePathText.textContent = text;
  el.templateFileName.textContent = found ? basename(text) : "Template not found";
  if (el.templateStatusBadge) {
    el.templateStatusBadge.textContent = found ? "Found" : "Missing";
    el.templateStatusBadge.className = `cloud-badge ${found ? "active" : "missing"}`;
  }
}

function updateExportActions() {
  el.exportStep?.classList.toggle("has-output", Boolean(state.lastOutputPath));
}

function showToast(message, type = "info", duration = 3200) {
  if (!el.toastStack) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  el.toastStack.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add("leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, duration);
}

async function refreshAppVersionLabel() {
  if (!el.appVersionText) return;
  try {
    const version = await api.getAppVersion();
    el.appVersionText.textContent = `Current version: v${version}`;
  } catch {
    el.appVersionText.textContent = "Current version unavailable";
  }
}

function hideUpdateBanner() {
  el.updateBanner?.classList.add("hidden");
}

function showUpdateBanner(result) {
  if (!el.updateBanner || state.updateDismissed) return;
  state.pendingUpdate = result;
  if (el.updateBannerText) {
    const notes = result.releaseNotes ? ` — ${result.releaseNotes}` : "";
    el.updateBannerText.textContent = `Version v${result.latestVersion} is available (you have v${result.currentVersion}).${notes}`;
  }
  el.updateBanner.classList.remove("hidden");
}

async function openPendingUpdateDownload() {
  const downloadUrl = state.pendingUpdate?.downloadUrl;
  if (!downloadUrl) return;
  await api.openUpdateDownload(downloadUrl);
}

async function checkForAppUpdate({ notify = false, manual = false } = {}) {
  try {
    const result = await api.checkForUpdate();
    if (result.status === "disabled") {
      if (manual) {
        showToast("ยังไม่ได้ตั้งค่า GitHub owner/repo ใน package.json", "info", 4200);
      }
      return;
    }

    if (result.status === "error") {
      if (notify || manual) {
        showToast(result.message, "error", manual ? 6500 : 4200);
      }
      return;
    }

    if (result.status === "available") {
      showUpdateBanner(result);
      if (notify) {
        showToast(`มีเวอร์ชันใหม่ v${result.latestVersion} — กด Download เพื่อดาวน์โหลด`, "info", 7200);
      }
      return;
    }

    hideUpdateBanner();
    state.pendingUpdate = undefined;
    if (manual) {
      showToast(`คุณใช้เวอร์ชันล่าสุดแล้ว (v${result.currentVersion})`, "success", 4200);
    }
  } catch (error) {
    if (notify || manual) {
      const text = error instanceof Error ? error.message : "Update check failed";
      showToast(text, "error", manual ? 6500 : 4200);
    }
  }
}

function hideMonthEndAlert() {
  el.monthEndAlert?.classList.add("hidden");
}

function showMonthEndAlert() {
  if (!el.monthEndAlert) return;
  void requestShowView("entryView");
  showToast("วันนี้เป็นวันสุดท้ายของเดือน — อย่าลืม import timeSheet จาก Sup!", "info", 7200);
  setStatus("Month-end reminder: import your Sup! timesheet", "idle");
  el.monthEndAlert.classList.remove("hidden");
  el.monthEndImportButton?.focus();
}

function confirmAction(message, options = {}) {
  const { confirmLabel = "Confirm", cancelLabel = "Cancel" } = options;
  return new Promise((resolve) => {
    el.confirmMessage.textContent = message;
    el.confirmOk.textContent = confirmLabel;
    el.confirmCancel.textContent = cancelLabel;
    el.confirmDialog.classList.remove("hidden");
    el.confirmOk.focus();

    const cleanup = (answer) => {
      el.confirmDialog.classList.add("hidden");
      el.confirmOk.textContent = "Confirm";
      el.confirmCancel.textContent = "Cancel";
      el.confirmOk.removeEventListener("click", onConfirm);
      el.confirmCancel.removeEventListener("click", onCancel);
      document.removeEventListener("keydown", onKeydown);
      resolve(answer);
    };
    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onKeydown = (event) => {
      if (event.key === "Escape") cleanup(false);
      if (event.key === "Enter") cleanup(true);
    };

    el.confirmOk.addEventListener("click", onConfirm);
    el.confirmCancel.addEventListener("click", onCancel);
    document.addEventListener("keydown", onKeydown);
  });
}

function handleKeyboardShortcuts(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "s") {
    event.preventDefault();
    if (document.querySelector(".view.active")?.id === "settingsView") void flushSettingsAutosave();
    else void saveEntryFromUi();
    return;
  }
  if (key === "1" || key === "2" || key === "3") {
    event.preventDefault();
    const viewMap = {
      "1": "entryView",
      "2": "generateView",
      "3": "settingsView"
    };
    void requestShowView(viewMap[key]);
    return;
  }
  if (key === "g" && document.querySelector(".view.active")?.id === "generateView") {
    event.preventDefault();
    el.generateButton.click();
    return;
  }
  if (key === "t") {
    event.preventDefault();
    el.todayButton.click();
  }
}

function showSetupModal() {
  el.setupModal?.classList.remove("hidden");
  replayAnimation(el.setupCard, "setup-pop");
}

function hideSetupModal() {
  el.setupModal?.classList.add("hidden");
}

async function refreshCloudStorageStatus(showStatus = false) {
  if (showStatus) setStatus("Checking Google Drive sync status...", "loading");

  const syncStatus = await api.getCloudSyncStatus();
  const detection = await api.detectGoogleDrive();

  if (syncStatus.didReconnect && syncStatus.settings) {
    state.settings = syncStatus.settings;
    fillSettingsForm(state.settings);
    captureSettingsSnapshot();
    updateSettingsAutosaveState("saved");
    updateSetupLock();
    showToast("Switched to this Google account's Drive folder", "success", 5200);
    setStatus(`Data folder updated: ${syncStatus.storageRoot}`, "success");
    void loadThaiHolidayPanel();
    void refreshMonthSummary();
    void refreshTemplatePath();
    void loadMonthPreview();
  }

  if (el.cloudStorageStatus) {
    el.cloudStorageStatus.textContent = syncStatus.headline;
    replayAnimation(el.cloudStorageStatus, "updated");
  }

  if (el.cloudStorageDetails) {
    el.cloudStorageDetails.innerHTML = "";
    syncStatus.details.forEach((detail) => {
      const item = document.createElement("li");
      item.textContent = detail;
      el.cloudStorageDetails.appendChild(item);
    });
    replayAnimation(el.cloudStorageDetails, "updated");
  }

  if (el.cloudStorageCheckedAt) {
    el.cloudStorageCheckedAt.textContent = `Last checked: ${formatTime(syncStatus.checkedAt)}`;
  }

  if (el.setupStatusText) {
    el.setupStatusText.textContent = syncStatus.headline;
  }

  applyCloudVisualState({
    badge: syncStatus.badge,
    badgeClass: syncStatus.badgeClass,
    panelClass: syncStatus.panelClass
  });

  if (el.settingsHint) {
    el.settingsHint.textContent =
      syncStatus.state === "synced"
        ? `Google Drive synced · ${syncStatus.storageRoot}`
        : syncStatus.storageRoot;
  }

  el.downloadGoogleDriveButton?.classList.toggle("hidden", syncStatus.installed);
  el.setupDownloadDriveButton?.classList.toggle("hidden", syncStatus.installed);
  const hasDriveAccounts = (detection.accounts?.length ?? 0) > 0 || Boolean(detection.suggestedDataPath);
  el.useGoogleDriveButton && (el.useGoogleDriveButton.disabled = !hasDriveAccounts);
  el.setupGoogleDriveButton && (el.setupGoogleDriveButton.disabled = !hasDriveAccounts);

  if (showStatus && !syncStatus.didReconnect) {
    setStatus(
      syncStatus.state === "synced" ? "Google Drive sync ready" : syncStatus.headline,
      syncStatus.state === "synced" ? "success" : "idle"
    );
  }
}

function applyCloudVisualState(visual) {
  el.cloudSetupPanel?.classList.remove("is-active", "is-local", "is-ready", "is-warning", "is-missing", "is-checking");
  el.cloudSetupPanel?.classList.add(visual.panelClass);
  el.setupCard?.classList.remove("is-active", "is-local", "is-ready", "is-warning", "is-missing", "is-checking");
  el.setupCard?.classList.add(visual.panelClass);

  for (const badgeEl of [el.cloudStorageBadge, el.setupStatusBadge]) {
    if (!badgeEl) continue;
    badgeEl.textContent = visual.badge;
    badgeEl.className = `cloud-badge ${visual.badgeClass}`;
    replayAnimation(badgeEl, "bump");
  }
}

async function continueAfterStorageSetup(message) {
  hideSetupModal();
  fillSettingsForm(state.settings);
  captureSettingsSnapshot();
  updateSettingsAutosaveState("saved");
  updateSetupLock();
  await refreshCloudStorageStatus();
  await loadThaiHolidayPanel();
  await refreshMonthSummary();
  await refreshTemplatePath();
  await loadMonthPreview();

  if (isAppSetupComplete(state.settings)) {
    setStatus(message, "success");
    showToast(message, "success");
    return;
  }

  await requestShowView("settingsView", { force: true });
  el.staffNameInput?.focus();
  setStatus("Storage ready — finish your profile in Settings", "success");
  showToast("Next: fill Staff name and Site", "success", 4200);
}

async function applyGoogleDriveFromUi() {
  const accounts = (await api.listGoogleDriveAccounts?.()) ?? (await api.detectGoogleDrive())?.accounts ?? [];
  if (!accounts.length) {
    const detection = await api.detectGoogleDrive();
    await refreshCloudStorageStatus();
    setStatus(detection?.message || "Google Drive folder not found", "error");
    return;
  }

  let selectedAccount = accounts.length === 1 ? accounts[0] : undefined;
  if (accounts.length > 1) {
    selectedAccount = await promptGoogleDriveAccount(accounts);
    if (!selectedAccount) {
      setStatus("Google Drive selection cancelled", "idle");
      return;
    }
  }

  const label = selectedAccount.email || selectedAccount.syncRoot || "Google Drive";
  await runWithStatus(`Connecting to ${label}...`, async () => {
    const result = await api.applyGoogleDriveStorage(selectedAccount.syncRoot);
    if (!result.ok) {
      if (result.needsSelection && result.accounts?.length) {
        document.body.classList.remove("is-busy");
        const picked = await promptGoogleDriveAccount(result.accounts);
        if (!picked) {
          setStatus("Google Drive selection cancelled", "idle");
          return;
        }
        document.body.classList.add("is-busy");
        setStatus(`Connecting to ${picked.email || picked.syncRoot}...`, "loading");
        const retry = await api.applyGoogleDriveStorage(picked.syncRoot);
        if (!retry.ok) {
          await refreshCloudStorageStatus();
          const text = retry.error || "Could not set up that Google Drive folder";
          setStatus(text, "error");
          showToast(text, "error", 6500);
          return;
        }
        state.settings = retry.settings;
        await continueAfterStorageSetup(`Using ${retry.account?.email || retry.account?.syncRoot || "Google Drive"}`);
        return;
      }
      await refreshCloudStorageStatus();
      const text = result.error || "Could not set up that Google Drive folder";
      setStatus(text, "error");
      showToast(text, "error", 6500);
      return;
    }
    state.settings = result.settings;
    await continueAfterStorageSetup(`Using ${result.account?.email || result.account?.syncRoot || label}`);
  });
}

function hideDrivePicker(result) {
  const finish = state.drivePickerResolve;
  state.drivePickerResolve = null;

  const modal = el.drivePickerModal;
  if (!modal || modal.classList.contains("hidden")) {
    if (el.drivePickerList) el.drivePickerList.innerHTML = "";
    finish?.(result);
    return;
  }

  modal.classList.add("is-closing");
  window.setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove("is-closing", "is-connecting");
    if (el.drivePickerList) el.drivePickerList.innerHTML = "";
    const connecting = el.drivePickerConnecting;
    if (connecting) {
      connecting.classList.add("hidden");
      connecting.textContent = "";
    }
    finish?.(result);
  }, 220);
}

function promptGoogleDriveAccount(accounts) {
  return new Promise((resolve) => {
    if (!el.drivePickerModal || !el.drivePickerList) {
      resolve(accounts[0] ?? undefined);
      return;
    }

    if (state.drivePickerResolve) {
      state.drivePickerResolve(undefined);
      state.drivePickerResolve = null;
    }
    state.drivePickerResolve = resolve;
    el.drivePickerList.innerHTML = "";
    el.drivePickerModal.classList.remove("is-closing", "is-connecting");
    if (el.drivePickerCancel) el.drivePickerCancel.disabled = false;
    if (el.drivePickerConnecting) {
      el.drivePickerConnecting.classList.add("hidden");
      el.drivePickerConnecting.textContent = "";
    }

    accounts.forEach((account) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "drive-picker-option";
      button.setAttribute("role", "option");

      const title = document.createElement("span");
      title.className = "drive-picker-option-email";
      title.textContent = account.email || account.label || account.syncRoot;

      const pathLine = document.createElement("span");
      pathLine.className = "drive-picker-option-path";
      pathLine.textContent = account.syncRoot;

      button.append(title, pathLine);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (el.drivePickerModal?.classList.contains("is-connecting")) return;

        el.drivePickerModal.classList.add("is-connecting");
        button.classList.add("is-selected");
        el.drivePickerList.querySelectorAll(".drive-picker-option").forEach((option) => {
          if (option !== button) option.classList.add("is-dimmed");
          option.disabled = true;
        });
        if (el.drivePickerCancel) el.drivePickerCancel.disabled = true;
        if (el.drivePickerConnecting) {
          el.drivePickerConnecting.classList.remove("hidden");
          el.drivePickerConnecting.innerHTML =
            `<span class="drive-picker-spinner" aria-hidden="true"></span>` +
            `<span>Connecting to ${account.email || account.syncRoot}...</span>`;
        }
        setStatus(`Connecting to ${account.email || account.syncRoot}...`, "loading");

        window.setTimeout(() => hideDrivePicker(account), 420);
      });
      el.drivePickerList.appendChild(button);
    });

    el.drivePickerModal.classList.remove("hidden");
  });
}

async function applyLocalStorageFromUi() {
  await runWithStatus("Setting up local storage...", async () => {
    const result = await api.applyLocalStorage();
    state.settings = result.settings;
    await continueAfterStorageSetup("Local storage configured");
  });
}

async function finishSetupFromUi() {
  const missing = missingProfileFields();
  if (missing.length) {
    updateSetupGateBanner();
    const firstEmpty = !el.staffNameInput.value.trim() ? el.staffNameInput : el.siteInput;
    firstEmpty?.focus();
    showToast(`Please fill: ${missing.join(", ")}`, "error", 4200);
    setStatus(`Please fill: ${missing.join(", ")}`, "error");
    return;
  }

  try {
    state.settings = await api.saveSettings(readSettingsForm());
    captureSettingsSnapshot();
    updateSettingsAutosaveState("saved");
    updateSetupLock();
  } catch (error) {
    const text = formatIpcError(error);
    updateSettingsAutosaveState("error");
    setStatus(text, "error");
    showToast(text, "error", 6500);
    return;
  }

  if (!isAppSetupComplete(state.settings)) {
    showToast("Finish setup in Settings first", "error", 3200);
    return;
  }

  showToast("Setup complete", "success");
  setStatus("Setup complete", "success");
  await requestShowView("entryView", { force: true });
}

async function loadThaiHolidayPanel(forceRefresh = false) {
  if (!el.thaiHolidayCheckboxList || !el.thaiHolidayMeta) return;

  const year = Number((el.monthInput?.value || `${new Date().getFullYear()}`).slice(0, 4));
  el.thaiHolidayMeta.textContent = forceRefresh
    ? `Refreshing Thai public holidays for ${year}...`
    : `Loading Thai public holidays for ${year}...`;
  el.thaiHolidayBadge && (el.thaiHolidayBadge.className = "cloud-badge checking");

  try {
    const cache = forceRefresh
      ? (await api.refreshThaiHolidays()).holidays.find((entry) => entry.year === year)
      : await api.getThaiHolidays(year);
    if (!cache) {
      el.thaiHolidayMeta.textContent = `No holiday data for ${year}`;
      el.thaiHolidayCheckboxList.innerHTML = "";
      return;
    }

    state.thaiHolidayCache = cache;
    renderThaiHolidayDropdown(cache);
  } catch (error) {
    el.thaiHolidayMeta.textContent = error?.message ?? "Failed to load Thai public holidays";
    el.thaiHolidayCheckboxList.innerHTML = "";
    el.thaiHolidayBadge && (el.thaiHolidayBadge.className = "cloud-badge missing");
  }
}

function holidaySlug(holiday) {
  if (holiday.slug) return holiday.slug;
  return `${holiday.startDate}-${holiday.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function renderThaiHolidayDropdown(cache) {
  const disabled = new Set(state.settings?.disabledThaiHolidaySlugs ?? []);
  const enabledCount = cache.holidays.filter((holiday) => !disabled.has(holidaySlug(holiday))).length;
  const fetchedAt = formatTime(cache.fetchedAt);

  el.thaiHolidayMeta.textContent = `Using ${enabledCount}/${cache.holidays.length} holidays for ${cache.year}, synced from ${cache.source} (${fetchedAt})`;
  el.thaiHolidaySelectionSummary.textContent = `${enabledCount}/${cache.holidays.length} enabled`;
  el.thaiHolidayBadge && (el.thaiHolidayBadge.className = "cloud-badge active");
  replayAnimation(el.thaiHolidayBadge, "bump");

  el.thaiHolidayCheckboxList.innerHTML = "";
  cache.holidays.forEach((holiday, index) => {
    const slug = holidaySlug(holiday);
    const label = document.createElement("label");
    label.className = "holiday-checkbox-option";
    label.style.setProperty("--stagger", `${Math.min(index * 18, 360)}ms`);
    const range =
      holiday.startDate === holiday.endDate
        ? formatPreviewDate(holiday.startDate)
        : `${formatPreviewDate(holiday.startDate)} – ${formatPreviewDate(holiday.endDate)}`;
    label.innerHTML = `
      <input type="checkbox" data-holiday-slug="${escapeHtml(slug)}" ${disabled.has(slug) ? "" : "checked"} />
      <span class="holiday-checkbox-copy">
        <strong>${escapeHtml(holiday.title)}</strong>
        <span>${range}</span>
      </span>
    `;
    label.querySelector("input").addEventListener("change", (event) => {
      void toggleThaiHoliday(slug, event.target.checked);
    });
    el.thaiHolidayCheckboxList.appendChild(label);
  });

  el.thaiHolidayCheckboxList.querySelectorAll(".holiday-checkbox-option").forEach((node) => {
    node.classList.add("stagger-in");
  });
  replayAnimation(el.thaiHolidayCheckboxList.closest(".thai-holidays-panel"), "updated");
  if (!el.thaiHolidayDropdownPanel?.classList.contains("hidden")) {
    positionThaiHolidayDropdownPanel();
  }
}

async function toggleThaiHoliday(slug, enabled) {
  const disabled = new Set(state.settings?.disabledThaiHolidaySlugs ?? []);
  if (enabled) disabled.delete(slug);
  else disabled.add(slug);

  state.settings = await api.saveSettings({
    ...readSettingsForm(),
    disabledThaiHolidaySlugs: [...disabled]
  });
  captureSettingsSnapshot();
  updateSettingsAutosaveState("saved");
  if (state.thaiHolidayCache) renderThaiHolidayDropdown(state.thaiHolidayCache);
  await refreshMonthSummary();
  await loadMonthPreview();
}

async function setAllThaiHolidays(enabled) {
  if (!state.thaiHolidayCache) return;
  const disabled = enabled ? [] : state.thaiHolidayCache.holidays.map((holiday) => holidaySlug(holiday));
  state.settings = await api.saveSettings({
    ...readSettingsForm(),
    disabledThaiHolidaySlugs: disabled
  });
  captureSettingsSnapshot();
  updateSettingsAutosaveState("saved");
  renderThaiHolidayDropdown(state.thaiHolidayCache);
  await refreshMonthSummary();
  await loadMonthPreview();
}

const HOLIDAY_DROPDOWN_MARGIN = 8;
const HOLIDAY_DROPDOWN_MAX_HEIGHT = 320;
let thaiHolidayDropdownAnchor = null;

function mountThaiHolidayDropdownPanel() {
  const panel = el.thaiHolidayDropdownPanel;
  const dropdown = panel?.closest(".holiday-dropdown");
  if (!panel || !dropdown || panel.parentElement === document.body) return;

  thaiHolidayDropdownAnchor = {
    parent: dropdown,
    nextSibling: panel.nextSibling
  };
  document.body.appendChild(panel);
}

function unmountThaiHolidayDropdownPanel() {
  const panel = el.thaiHolidayDropdownPanel;
  if (!panel || !thaiHolidayDropdownAnchor || panel.parentElement !== document.body) return;

  const { parent, nextSibling } = thaiHolidayDropdownAnchor;
  if (nextSibling && nextSibling.parentElement === parent) {
    parent.insertBefore(panel, nextSibling);
  } else {
    parent.appendChild(panel);
  }
  thaiHolidayDropdownAnchor = null;
}

function positionThaiHolidayDropdownPanel() {
  const button = el.thaiHolidayDropdownButton;
  const panel = el.thaiHolidayDropdownPanel;
  if (!button || !panel || panel.classList.contains("hidden")) return;

  mountThaiHolidayDropdownPanel();

  const rect = button.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const width = Math.max(rect.width, 280);
  const spaceBelow = viewportHeight - rect.bottom - HOLIDAY_DROPDOWN_MARGIN;
  const spaceAbove = rect.top - HOLIDAY_DROPDOWN_MARGIN;
  const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    HOLIDAY_DROPDOWN_MAX_HEIGHT,
    (openUpward ? spaceAbove : spaceBelow) - HOLIDAY_DROPDOWN_MARGIN
  );

  let left = Math.max(HOLIDAY_DROPDOWN_MARGIN, rect.left);
  const maxLeft = viewportWidth - width - HOLIDAY_DROPDOWN_MARGIN;
  if (left > maxLeft) left = Math.max(HOLIDAY_DROPDOWN_MARGIN, maxLeft);

  panel.classList.add("is-floating");
  panel.style.width = `${width}px`;
  panel.style.left = `${left}px`;
  panel.style.maxHeight = `${Math.max(160, maxHeight)}px`;

  if (openUpward) {
    panel.style.top = "auto";
    panel.style.bottom = `${viewportHeight - rect.top + HOLIDAY_DROPDOWN_MARGIN}px`;
  } else {
    panel.style.top = `${rect.bottom + HOLIDAY_DROPDOWN_MARGIN}px`;
    panel.style.bottom = "auto";
  }
}

function resetThaiHolidayDropdownPanelPosition() {
  const panel = el.thaiHolidayDropdownPanel;
  if (!panel) return;
  panel.classList.remove("is-floating");
  panel.style.removeProperty("top");
  panel.style.removeProperty("bottom");
  panel.style.removeProperty("left");
  panel.style.removeProperty("width");
  panel.style.removeProperty("max-height");
  unmountThaiHolidayDropdownPanel();
}

function toggleThaiHolidayDropdown() {
  if (!el.thaiHolidayDropdownPanel || !el.thaiHolidayDropdownButton) return;
  const isOpen = el.thaiHolidayDropdownPanel.classList.toggle("hidden") === false;
  el.thaiHolidayDropdownButton.setAttribute("aria-expanded", String(isOpen));
  el.thaiHolidayDropdownButton.classList.toggle("open", isOpen);
  if (isOpen) {
    positionThaiHolidayDropdownPanel();
  } else {
    resetThaiHolidayDropdownPanelPosition();
  }
}

function closeThaiHolidayDropdown() {
  if (!el.thaiHolidayDropdownPanel || !el.thaiHolidayDropdownButton) return;
  el.thaiHolidayDropdownPanel.classList.add("hidden");
  el.thaiHolidayDropdownButton.setAttribute("aria-expanded", "false");
  el.thaiHolidayDropdownButton.classList.remove("open");
  resetThaiHolidayDropdownPanelPosition();
}

let suppressLeaveTypePrompt = false;

function getSelectedHalfDayPeriod() {
  const selected = document.querySelector('input[name="leaveHalfDayPeriod"]:checked');
  return selected?.value === "afternoon" ? "afternoon" : "morning";
}

function setHalfDayPeriod(period = "morning") {
  const value = period === "afternoon" ? "afternoon" : "morning";
  document.querySelectorAll('input[name="leaveHalfDayPeriod"]').forEach((input) => {
    input.checked = input.value === value;
  });
}

function updateLeaveHalfDayVisibility() {
  const sick = el.leaveTypeInput?.value === "sick";
  const halfDay = sick && Boolean(el.leaveHalfDayInput?.checked);
  el.leaveHalfDayField?.classList.toggle("hidden", !sick);
  el.leaveHalfDayPeriodField?.classList.toggle("hidden", !halfDay);
}

async function handleLeaveTypeChange() {
  updateLeaveHalfDayVisibility();
  if (suppressLeaveTypePrompt) return;

  if (el.leaveTypeInput?.value === "sick") {
    const halfDay = await confirmAction("Is this a half-day sick leave?", {
      confirmLabel: "Yes, half day",
      cancelLabel: "No, full day"
    });
    if (el.leaveHalfDayInput) el.leaveHalfDayInput.checked = halfDay;
    if (halfDay) {
      const morning = await confirmAction("Which half-day period?", {
        confirmLabel: "Morning 09:00–12:00",
        cancelLabel: "Afternoon 13:00–18:00"
      });
      setHalfDayPeriod(morning ? "morning" : "afternoon");
    } else {
      setHalfDayPeriod("morning");
    }
    updateLeaveHalfDayVisibility();
    return;
  }

  if (el.leaveHalfDayInput) el.leaveHalfDayInput.checked = false;
  setHalfDayPeriod("morning");
  updateLeaveHalfDayVisibility();
}

async function fillLeaveForm(date) {
  if (!el.leaveDateInput) return;
  el.leaveDateInput.value = date;
  await loadLeaveForDate();
  document.querySelector('.timesheet-step[data-step="2"]')?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  el.leaveDateInput.focus();
}

async function loadLeaveForDate() {
  if (!el.leaveDateInput?.value) return;
  const existing = await api.loadLeave(el.leaveDateInput.value);
  suppressLeaveTypePrompt = true;
  if (!existing) {
    el.leaveTypeInput.value = "annual";
    el.leaveDetailInput.value = "";
    if (el.leaveHalfDayInput) el.leaveHalfDayInput.checked = false;
    setHalfDayPeriod("morning");
    updateLeaveHalfDayVisibility();
    suppressLeaveTypePrompt = false;
    return;
  }
  el.leaveTypeInput.value = existing.type;
  el.leaveDetailInput.value = existing.detail ?? "";
  if (el.leaveHalfDayInput) el.leaveHalfDayInput.checked = Boolean(existing.halfDay);
  setHalfDayPeriod(existing.halfDayPeriod === "afternoon" ? "afternoon" : "morning");
  updateLeaveHalfDayVisibility();
  suppressLeaveTypePrompt = false;
}

async function saveLeaveFromUi() {
  if (!el.leaveDateInput?.value) {
    setStatus("Select a leave date first", "error");
    return;
  }
  const halfDay = el.leaveTypeInput.value === "sick" && Boolean(el.leaveHalfDayInput?.checked);
  await runWithStatus("Saving leave...", async () => {
    await api.saveLeave({
      date: el.leaveDateInput.value,
      type: el.leaveTypeInput.value,
      detail: el.leaveDetailInput.value,
      halfDay,
      halfDayPeriod: halfDay ? getSelectedHalfDayPeriod() : undefined
    });
    await refreshMonthSummary();
    await loadMonthPreview();
    setStatus(`Leave saved for ${el.leaveDateInput.value}`, "success");
    showToast("Leave saved", "success");
  });
}

async function clearLeaveFromUi() {
  if (!el.leaveDateInput?.value) {
    setStatus("Select a leave date first", "error");
    return;
  }
  const confirmed = await confirmAction(`Clear leave for ${el.leaveDateInput.value}?`);
  if (!confirmed) return;
  await runWithStatus("Clearing leave...", async () => {
    await api.removeLeave(el.leaveDateInput.value);
    el.leaveTypeInput.value = "annual";
    el.leaveDetailInput.value = "";
    if (el.leaveHalfDayInput) el.leaveHalfDayInput.checked = false;
    setHalfDayPeriod("morning");
    updateLeaveHalfDayVisibility();
    await refreshMonthSummary();
    await loadMonthPreview();
    setStatus(`Leave cleared for ${el.leaveDateInput.value}`, "success");
    showToast("Leave cleared", "success");
  });
}

function syncOvertimeDateBounds(month) {
  if (!el.overtimeDateInput || !month) return;
  const [year, monthText] = month.split("-");
  const lastDay = new Date(Number(year), Number(monthText), 0).getDate();
  el.overtimeDateInput.min = `${month}-01`;
  el.overtimeDateInput.max = `${month}-${String(lastDay).padStart(2, "0")}`;
}

function updateOvertimeFormVisibility() {
  if (!el.overtimeFormPanel || !el.hasOvertimeCheckbox) return;
  const visible = el.hasOvertimeCheckbox.checked;
  el.overtimeFormPanel.classList.toggle("is-visible", visible);
  el.overtimePanel?.classList.toggle("is-active", visible);
}

function getSelectedOvertimeLunch() {
  return el.overtimeLunchInput?.checked ? "YES" : "NO";
}

function setOvertimeLunch(value) {
  if (el.overtimeLunchInput) el.overtimeLunchInput.checked = value === "YES";
}

function resetOvertimeFormFields() {
  if (el.overtimeTimeInInput) el.overtimeTimeInInput.value = "18:00";
  if (el.overtimeTimeOutInput) el.overtimeTimeOutInput.value = "20:00";
  setOvertimeLunch("NO");
  if (el.overtimeDetailInput) el.overtimeDetailInput.value = "";
}

function renderOvertimeEntryList(entries) {
  if (!el.overtimeEntryList) return;
  el.overtimeEntryList.innerHTML = "";
  if (el.overtimeEmptyState) {
    el.overtimeEmptyState.classList.toggle("hidden", entries.length > 0);
  }
  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "overtime-entry-item";
    const lunchLabel =
      entry.includedLunchTime === "YES" ? "Lunch included" : "No lunch break";
    item.innerHTML = `
      <div class="overtime-entry-main">
        <div class="overtime-entry-top">
          <strong class="overtime-entry-date">${escapeHtml(formatCalendarDate(entry.date))}</strong>
          <span class="legend-chip overtime-chip">${escapeHtml(entry.timeIn ?? "18:00")}–${escapeHtml(entry.timeOut ?? "20:00")}</span>
        </div>
        <span class="overtime-entry-meta">${escapeHtml(lunchLabel)}</span>
        <span class="overtime-entry-detail">${escapeHtml(entry.detail)}</span>
      </div>
      <button type="button" class="overtime-entry-edit">Edit</button>
    `;
    item.querySelector(".overtime-entry-edit")?.addEventListener("click", () => {
      void fillOvertimeForm(entry.date);
    });
    el.overtimeEntryList.appendChild(item);
  });
}

async function refreshOvertimePanel(options = {}) {
  const { resetToggle = false } = options;
  if (!el.hasOvertimeCheckbox || !el.monthInput?.value) return;
  const month = el.monthInput.value;
  syncOvertimeDateBounds(month);
  const entries = await api.loadOvertimeMonth(month);
  if (entries.length > 0) {
    el.hasOvertimeCheckbox.checked = true;
  } else if (resetToggle) {
    el.hasOvertimeCheckbox.checked = false;
  }
  updateOvertimeFormVisibility();
  renderOvertimeEntryList(entries);
  if (!el.overtimeDateInput?.value || !el.overtimeDateInput.value.startsWith(month)) {
    if (el.overtimeDateInput) el.overtimeDateInput.value = `${month}-01`;
  }
  if (el.hasOvertimeCheckbox.checked) {
    await loadOvertimeForDate();
  } else {
    resetOvertimeFormFields();
  }
}

async function fillOvertimeForm(date) {
  if (!el.overtimeDateInput) return;
  if (el.hasOvertimeCheckbox) {
    el.hasOvertimeCheckbox.checked = true;
    updateOvertimeFormVisibility();
  }
  el.overtimeDateInput.value = date;
  await loadOvertimeForDate();
  document.querySelector('.timesheet-step[data-step="2"]')?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  el.overtimeDetailInput?.focus();
}

async function loadOvertimeForDate() {
  if (!el.overtimeDateInput?.value) return;
  const existing = await api.loadOvertime(el.overtimeDateInput.value);
  if (!existing) {
    resetOvertimeFormFields();
    return;
  }
  if (el.overtimeTimeInInput) el.overtimeTimeInInput.value = existing.timeIn ?? "18:00";
  if (el.overtimeTimeOutInput) el.overtimeTimeOutInput.value = existing.timeOut ?? "20:00";
  setOvertimeLunch(existing.includedLunchTime ?? "NO");
  if (el.overtimeDetailInput) el.overtimeDetailInput.value = existing.detail ?? "";
}

async function saveOvertimeFromUi() {
  if (!el.hasOvertimeCheckbox?.checked) {
    setStatus("Turn on overtime before saving", "error");
    return;
  }
  if (!el.overtimeDateInput?.value) {
    setStatus("Select an overtime date first", "error");
    return;
  }
  if (!el.overtimeDetailInput?.value.trim()) {
    setStatus("Enter overtime detail before saving", "error");
    return;
  }
  await runWithStatus("Saving overtime...", async () => {
    await api.saveOvertime({
      date: el.overtimeDateInput.value,
      timeIn: el.overtimeTimeInInput?.value,
      timeOut: el.overtimeTimeOutInput?.value,
      includedLunchTime: getSelectedOvertimeLunch(),
      detail: el.overtimeDetailInput.value
    });
    await refreshOvertimePanel();
    await loadMonthPreview();
    setStatus(`Overtime saved for ${el.overtimeDateInput.value}`, "success");
    showToast("Overtime saved", "success");
  });
}

async function clearOvertimeFromUi() {
  if (!el.overtimeDateInput?.value) {
    setStatus("Select an overtime date first", "error");
    return;
  }
  const confirmed = await confirmAction(`Clear overtime for ${el.overtimeDateInput.value}?`);
  if (!confirmed) return;
  await runWithStatus("Clearing overtime...", async () => {
    await api.removeOvertime(el.overtimeDateInput.value);
    resetOvertimeFormFields();
    await refreshOvertimePanel();
    await loadMonthPreview();
    setStatus(`Overtime cleared for ${el.overtimeDateInput.value}`, "success");
    showToast("Overtime cleared", "success");
  });
}

async function refreshThaiHolidaysFromUi() {
  await runWithStatus("Refreshing Thai public holidays...", async () => {
    await api.refreshThaiHolidays();
    await loadThaiHolidayPanel(false);
    await refreshMonthSummary();
    await loadMonthPreview();
    setStatus("Thai public holidays refreshed", "success");
  });
}

el.yesterdayInput.addEventListener("scroll", () => {
  el.yesterdayHighlight.scrollTop = el.yesterdayInput.scrollTop;
  el.yesterdayHighlight.scrollLeft = el.yesterdayInput.scrollLeft;
});
el.todayInput.addEventListener("scroll", () => {
  el.todayHighlight.scrollTop = el.todayInput.scrollTop;
  el.todayHighlight.scrollLeft = el.todayInput.scrollLeft;
});
