import { execFile } from "node:child_process";
import { existsSync, openSync, readFileSync, closeSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export const GOOGLE_DRIVE_DOWNLOAD_URL = "https://www.google.com/drive/download/";
export const APP_DATA_FOLDER = "SupTimesheetAutomation";

const execFileAsync = promisify(execFile);
const EMAIL_PATTERN = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

export interface GoogleDriveDetection {
  installed: boolean;
  syncRoot?: string;
  suggestedDataPath?: string;
  accounts: GoogleDriveAccount[];
  downloadUrl: string;
  message: string;
}

export interface GoogleDriveAccount {
  syncRoot: string;
  suggestedDataPath: string;
  email?: string;
  accountId?: string;
  label: string;
  mountLetter?: string;
}

export type GoogleDriveSyncState =
  | "synced"
  | "local-only"
  | "drive-stopped"
  | "ready"
  | "needs-sign-in"
  | "not-installed";

export interface GoogleDriveSyncStatus {
  state: GoogleDriveSyncState;
  installed: boolean;
  running: boolean;
  syncRoot?: string;
  storageRoot: string;
  storageInDriveFolder: boolean;
  suggestedDataPath?: string;
  needsReconnect: boolean;
  accounts: GoogleDriveAccount[];
  downloadUrl: string;
  badge: string;
  badgeClass: string;
  panelClass: string;
  headline: string;
  details: string[];
  checkedAt: string;
}

export function isPathInside(childPath: string, parentPath: string): boolean {
  const child = path.resolve(path.normalize(childPath));
  const parent = path.resolve(path.normalize(parentPath));
  if (child === parent) return true;
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function matchesGoogleDriveSyncFolder(storageRoot: string, syncRoots: string[]): boolean {
  const normalizedStorage = path.resolve(path.normalize(storageRoot));
  return syncRoots.some((syncRoot) => {
    const normalizedSyncRoot = path.resolve(path.normalize(syncRoot));
    return (
      normalizedStorage === normalizedSyncRoot ||
      isPathInside(normalizedStorage, normalizedSyncRoot) ||
      isPathInside(normalizedSyncRoot, normalizedStorage)
    );
  });
}

export function resolveAppDataPath(syncRoot: string): string {
  return path.join(syncRoot, APP_DATA_FOLDER);
}

export function accountLabel(account: Pick<GoogleDriveAccount, "email" | "syncRoot">): string {
  return account.email?.trim() || account.syncRoot;
}

export function isGoogleDriveInstalled(): boolean {
  if (process.platform !== "win32") return false;
  return googleDriveInstallCandidates().some((candidate) => existsSync(candidate));
}

function googleDriveInstallCandidates(): string[] {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  const candidates = [
    path.join(localAppData, "Google", "DriveFS", "GoogleDriveFS.exe"),
    path.join(localAppData, "Google", "Drive", "googledrivesync.exe")
  ];

  for (const programRoot of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
    if (!programRoot) continue;
    const driveStreamRoot = path.join(programRoot, "Google", "Drive File Stream");
    if (!existsSync(driveStreamRoot)) continue;
    try {
      for (const entry of readdirSync(driveStreamRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        candidates.push(path.join(driveStreamRoot, entry.name, "GoogleDriveFS.exe"));
      }
      candidates.push(path.join(driveStreamRoot, "GoogleDriveFS.exe"));
    } catch {
      // ignore unreadable install directory
    }
  }

  return candidates;
}

export async function detectGoogleDrive(): Promise<GoogleDriveDetection> {
  const downloadUrl = GOOGLE_DRIVE_DOWNLOAD_URL;

  if (process.platform !== "win32") {
    return {
      installed: false,
      accounts: [],
      downloadUrl,
      message: "Google Drive auto-setup is only supported on Windows."
    };
  }

  const running = await isGoogleDriveRunning();
  const installed = isGoogleDriveInstalled() || running;

  if (!installed) {
    return {
      installed: false,
      accounts: [],
      downloadUrl,
      message: "Google Drive for Desktop is not installed on this computer."
    };
  }

  const accounts = await listGoogleDriveAccounts();
  if (!accounts.length) {
    return {
      installed: true,
      accounts: [],
      downloadUrl,
      message:
        "Google Drive is installed, but the sync folder was not found. Open Google Drive and finish sign-in first."
    };
  }

  const primary = accounts[0];
  return {
    installed: true,
    syncRoot: primary.syncRoot,
    suggestedDataPath: primary.suggestedDataPath,
    accounts,
    downloadUrl,
    message:
      accounts.length === 1
        ? `Google Drive found at ${primary.syncRoot}`
        : `Found ${accounts.length} Google Drive accounts. Choose which one to use.`
  };
}

export async function isGoogleDriveRunning(): Promise<boolean> {
  if (process.platform !== "win32") return false;

  try {
    const { stdout } = await execFileAsync(
      "tasklist",
      ["/FI", "IMAGENAME eq GoogleDriveFS.exe", "/NH"],
      { windowsHide: true }
    );
    return stdout.toLowerCase().includes("googledrivefs.exe");
  } catch {
    return false;
  }
}

export async function getGoogleDriveSyncStatus(
  storageRoot: string,
  storageProvider: "local" | "google-drive" = "local"
): Promise<GoogleDriveSyncStatus> {
  const running = await isGoogleDriveRunning();
  const installed = isGoogleDriveInstalled() || running;
  const accounts = await listGoogleDriveAccounts();
  const syncRoots = accounts.map((account) => account.syncRoot);
  const normalizedStorage = path.normalize(storageRoot || "");
  const matchedAccount = accounts.find((account) =>
    matchesGoogleDriveSyncFolder(normalizedStorage, [account.syncRoot])
  );
  const syncRoot = matchedAccount?.syncRoot ?? syncRoots[0];
  const storageInDriveFolder = normalizedStorage
    ? matchesGoogleDriveSyncFolder(normalizedStorage, syncRoots)
    : false;
  const suggestedDataPath =
    matchedAccount?.suggestedDataPath ??
    (syncRoots[0] ? resolveAppDataPath(syncRoots[0]) : undefined);
  const storageExists = Boolean(normalizedStorage && existsSync(normalizedStorage));
  // Reconnect only when the folder is missing or outside EVERY current sync root.
  // Do not force-switch away from a valid secondary account (e.g. H:) back to G:.
  const needsReconnect =
    storageProvider === "google-drive" &&
    Boolean(accounts.length) &&
    (!storageExists || !storageInDriveFolder);
  const checkedAt = new Date().toISOString();
  const base = {
    installed,
    running,
    syncRoot,
    storageRoot: normalizedStorage,
    storageInDriveFolder,
    suggestedDataPath,
    needsReconnect,
    accounts,
    downloadUrl: GOOGLE_DRIVE_DOWNLOAD_URL,
    checkedAt
  };

  if (!installed) {
    return {
      ...base,
      state: "not-installed",
      badge: "Not installed",
      badgeClass: "missing",
      panelClass: "is-missing",
      headline: "Google Drive for Desktop is not installed.",
      details: ["Install Google Drive to sync your timesheet data across computers."]
    };
  }

  if (!syncRoots.length) {
    return {
      ...base,
      state: "needs-sign-in",
      badge: "Needs sign-in",
      badgeClass: "warning",
      panelClass: "is-warning",
      headline: "Google Drive is installed but the sync folder was not found.",
      details: [
        "Open Google Drive for Desktop and finish sign-in.",
        `Drive app: ${running ? "Running" : "Not running"}`
      ]
    };
  }

  const driveDetails = [
    `Drive app: ${running ? "Running" : "Not running"}`,
    ...accounts.map((account) => `Account: ${accountLabel(account)} · ${account.syncRoot}`),
    `Data folder: ${normalizedStorage || "(not set)"}`
  ];

  if (needsReconnect) {
    return {
      ...base,
      state: "ready",
      badge: "Account changed",
      badgeClass: "warning",
      panelClass: "is-warning",
      headline:
        accounts.length > 1
          ? "Data folder is outside current Google Drive accounts — choose which Drive to use."
          : "Google account changed — reconnect the data folder to the current My Drive.",
      details: [
        ...driveDetails,
        accounts.length === 1 ? `Recommended folder: ${suggestedDataPath}` : "",
        'Click "Use Google Drive" to reconnect.'
      ].filter(Boolean)
    };
  }

  if (storageInDriveFolder && running) {
    return {
      ...base,
      state: "synced",
      badge: "Synced",
      badgeClass: "active",
      panelClass: "is-active",
      headline: matchedAccount?.email
        ? `Google Drive sync is active (${matchedAccount.email}).`
        : "Google Drive sync is active for this data folder.",
      details: driveDetails
    };
  }

  if (storageInDriveFolder && !running) {
    return {
      ...base,
      state: "drive-stopped",
      badge: "Drive stopped",
      badgeClass: "warning",
      panelClass: "is-warning",
      headline: "This folder is synced with Google Drive, but the Drive app is not running.",
      details: [...driveDetails, "Start Google Drive for Desktop to resume syncing."]
    };
  }

  if (suggestedDataPath) {
    return {
      ...base,
      state: storageProvider === "google-drive" ? "ready" : "local-only",
      badge: storageProvider === "google-drive" ? "Not in Drive" : "Local only",
      badgeClass: storageProvider === "google-drive" ? "warning" : "local",
      panelClass: storageProvider === "google-drive" ? "is-warning" : "is-local",
      headline:
        storageProvider === "google-drive"
          ? "Configured for Google Drive, but the current folder is outside the sync folder."
          : "This data folder is outside your Google Drive sync folders.",
      details: [
        ...driveDetails,
        suggestedDataPath !== normalizedStorage ? `Recommended synced folder: ${suggestedDataPath}` : "",
        'Choose a folder inside a sync folder, or click "Use Google Drive".'
      ].filter(Boolean)
    };
  }

  return {
    ...base,
    state: "local-only",
    badge: "Local only",
    badgeClass: "local",
    panelClass: "is-local",
    headline: "Using local storage on this PC.",
    details: driveDetails
  };
}

export async function findGoogleDriveSyncRoot(): Promise<string | undefined> {
  const roots = await findGoogleDriveSyncRoots();
  return roots[0];
}

export async function listGoogleDriveAccounts(): Promise<GoogleDriveAccount[]> {
  if (process.platform !== "win32") return [];

  const syncRoots = await findGoogleDriveSyncRoots();
  if (!syncRoots.length) return [];

  const emailByAccountId = readEmailsByAccountId();
  const mountByAccountId = await readMountLettersByAccountId();
  const accountIdByMount = new Map<string, string>();
  for (const [accountId, letter] of mountByAccountId) {
    accountIdByMount.set(letter.toUpperCase(), accountId);
  }

  const usedAccountIds = new Set<string>();
  const accounts: GoogleDriveAccount[] = syncRoots.map((syncRoot) => {
    const fromPath = extractEmailFromSyncRoot(syncRoot);
    const mountLetter = extractMountLetter(syncRoot);
    const accountId = mountLetter ? accountIdByMount.get(mountLetter) : undefined;
    if (accountId) usedAccountIds.add(accountId);
    const email = fromPath || (accountId ? emailByAccountId.get(accountId) : undefined);
    return {
      syncRoot,
      suggestedDataPath: resolveAppDataPath(syncRoot),
      email,
      accountId,
      mountLetter,
      label: accountLabel({ email, syncRoot })
    };
  });

  // If one account has email but no mount letter, pair it with the one unmapped root.
  const leftoverIds = [...emailByAccountId.keys()].filter((id) => !usedAccountIds.has(id));
  const unmapped = accounts.filter((account) => !account.email);
  if (leftoverIds.length === 1 && unmapped.length === 1) {
    const accountId = leftoverIds[0];
    unmapped[0].accountId = accountId;
    unmapped[0].email = emailByAccountId.get(accountId);
    unmapped[0].label = accountLabel(unmapped[0]);
  }

  return accounts.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export async function findGoogleDriveSyncRoots(): Promise<string[]> {
  const roots = new Set<string>();

  for (const entry of await readSyncTargetsFromRegistry()) {
    if (isUsableSyncRoot(entry)) roots.add(path.normalize(entry));
  }

  const mountPoint = await readMountPointFromRegistry();
  if (mountPoint && isUsableSyncRoot(mountPoint)) roots.add(path.normalize(mountPoint));

  for (const candidate of commonSyncRootCandidates()) {
    if (isUsableSyncRoot(candidate)) roots.add(path.normalize(candidate));
  }

  for (const letter of "GHIJKLMNOPQRSTUVWXYZ") {
    const candidate = `${letter}:\\My Drive`;
    if (isUsableSyncRoot(candidate)) roots.add(path.normalize(candidate));
  }

  return [...roots];
}

export function extractPathsFromRegistryBinary(raw: string): string[] {
  const hex = raw.replace(/[^0-9A-Fa-f]/g, "");
  if (!hex) return [];

  const buffer = Buffer.from(hex, "hex");
  const latin1 = buffer.toString("latin1");
  const utf16 = buffer.toString("utf16le");
  const matches = new Set<string>();

  for (const source of [latin1, utf16]) {
    for (const match of source.match(/[A-Za-z]:\\[^*\0<>|"?]+/g) ?? []) {
      const cleaned = path.normalize(match.replace(/[\0.]+$/g, "").trim());
      if (/^[A-Za-z]:\\/.test(cleaned)) matches.add(cleaned);
    }
  }

  return [...matches];
}

export function extractEmailFromSyncRoot(syncRoot: string): string | undefined {
  const match = syncRoot.match(/GoogleDrive-([^\\/]+@[^\s\\/]+)/i);
  if (!match?.[1]) return undefined;
  return sanitizeEmail(match[1]);
}

export function extractMountLetter(syncRoot: string): string | undefined {
  const match = path.normalize(syncRoot).match(/^([A-Za-z]):\\/);
  return match?.[1]?.toUpperCase();
}

function commonSyncRootCandidates(): string[] {
  const home = os.homedir();
  return [
    path.join(home, "Google Drive", "My Drive"),
    path.join(home, "My Drive"),
    path.join(home, "Google Drive")
  ];
}

function isUsableSyncRoot(candidate: string): boolean {
  if (!candidate) return false;
  try {
    return existsSync(candidate);
  } catch {
    return false;
  }
}

function driveFsRoot(): string {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "Google", "DriveFS");
}

function readEmailsByAccountId(): Map<string, string> {
  const map = new Map<string, string>();
  const root = driveFsRoot();
  const logsDir = path.join(root, "Logs");

  for (const accountId of listDriveFsAccountIds(root)) {
    const perAccountLog = path.join(logsDir, `structured_log_${accountId}`);
    const email = extractFirstUserEmail(readFileShared(perAccountLog));
    if (email) map.set(accountId, email);
  }

  if (!existsSync(logsDir)) return map;

  let files: string[] = [];
  try {
    files = readdirSync(logsDir)
      .filter((name) => name.startsWith("structured_log_global"))
      .map((name) => path.join(logsDir, name));
  } catch {
    return map;
  }

  for (const file of files) {
    const text = readFileShared(file);
    if (!text) continue;

    for (const match of text.matchAll(
      /([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})[\x00-\x20]{0,6}(\d{15,})/g
    )) {
      const email = sanitizeEmail(match[1]);
      const accountId = match[2];
      if (email && accountId && !map.has(accountId)) map.set(accountId, email);
    }
  }

  return map;
}

function listDriveFsAccountIds(root = driveFsRoot()): string[] {
  if (!existsSync(root)) return [];
  try {
    return readdirSync(root).filter((name) => /^\d{15,}$/.test(name));
  } catch {
    return [];
  }
}

function extractFirstUserEmail(text: string | undefined): string | undefined {
  if (!text) return undefined;
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    const email = sanitizeEmail(match[0]);
    if (email) return email;
  }
  return undefined;
}

async function readMountLettersByAccountId(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const raw = await readRegistryValue(String.raw`HKCU\Software\Google\DriveFS`, "PerAccountPreferences");
  if (!raw) return map;

  try {
    const parsed = JSON.parse(raw) as {
      per_account_preferences?: Array<{ key?: string; value?: { mount_point_path?: string } }>;
    };
    for (const entry of parsed.per_account_preferences ?? []) {
      const accountId = entry.key?.trim();
      const letter = entry.value?.mount_point_path?.trim().replace(/:$/, "").toUpperCase();
      if (accountId && letter && /^[A-Z]$/.test(letter)) map.set(accountId, letter);
    }
  } catch {
    // ignore malformed preferences
  }

  return map;
}

function sanitizeEmail(raw: string): string | undefined {
  let email = raw.trim().toLowerCase();
  // DriveFS protobuf often appends a 1-char tag after the address (e.g. ".comZ").
  email = email.replace(/(\.(?:com|net|org|edu|gov|io|info|me|co\.th))[a-z0-9]$/i, "$1");
  email = email.replace(/[^\w.@+\-]+$/g, "");
  if (!email.includes("@")) return undefined;
  EMAIL_PATTERN.lastIndex = 0;
  if (!EMAIL_PATTERN.test(email)) return undefined;
  EMAIL_PATTERN.lastIndex = 0;
  if (/@(google|gstatic|example)\./i.test(email)) return undefined;
  return email;
}

function readFileShared(filePath: string): string | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    const fd = openSync(filePath, "r");
    try {
      // latin1 preserves binary protobuf bytes so email ASCII still matches.
      const buffer = readFileSync(fd);
      return buffer.toString("latin1");
    } finally {
      closeSync(fd);
    }
  } catch {
    try {
      return readFileSync(filePath).toString("latin1");
    } catch {
      return undefined;
    }
  }
}

async function readSyncTargetsFromRegistry(): Promise<string[]> {
  const paths = new Set<string>();

  try {
    const { stdout } = await execFileAsync(
      "reg",
      ["query", String.raw`HKCU\Software\Google\DriveFS`, "/s", "/f", "SyncTargets"],
      { windowsHide: true }
    );

    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.toLowerCase().includes("synctargets") || !trimmed.toLowerCase().includes("reg_binary")) continue;
      const raw = trimmed.split(/\s{2,}/).slice(2).join(" ").trim();
      for (const entry of extractPathsFromRegistryBinary(raw)) {
        paths.add(entry);
      }
    }
  } catch {
    // fall back to known keys below
  }

  for (const key of [String.raw`HKCU\Software\Google\DriveFS\Share`, String.raw`HKCU\Software\Google\DriveFS\Default`]) {
    const raw = await readRegistryRawValue(key, "SyncTargets");
    if (!raw) continue;
    for (const entry of extractPathsFromRegistryBinary(raw)) {
      paths.add(entry);
    }
  }

  return [...paths];
}

async function readRegistryRawValue(key: string, valueName: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("reg", ["query", key, "/v", valueName], { windowsHide: true });
    const line = stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry.toLowerCase().startsWith(valueName.toLowerCase()));
    if (!line) return undefined;

    const parts = line.split(/\s{2,}/);
    return parts.slice(2).join(" ").trim();
  } catch {
    return undefined;
  }
}

async function readMountPointFromRegistry(): Promise<string | undefined> {
  const keys = [
    String.raw`HKCU\Software\Google\DriveFS\Share`,
    String.raw`HKCU\Software\Google\DriveFS\Default`,
    String.raw`HKCU\Software\Google\Drive`
  ];

  for (const key of keys) {
    for (const valueName of ["MountPoint", "Path", "SyncRoot"]) {
      const value = await readRegistryValue(key, valueName);
      if (value && existsSync(value)) return value;
    }
  }

  return undefined;
}

async function readRegistryValue(key: string, valueName: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("reg", ["query", key, "/v", valueName], { windowsHide: true });
    const line = stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry.toLowerCase().startsWith(valueName.toLowerCase()));
    if (!line) return undefined;

    const parts = line.split(/\s{2,}/);
    const raw = parts.at(-1)?.trim();
    if (!raw) return undefined;
    return raw.replace(/^"|"$/g, "");
  } catch {
    return undefined;
  }
}
