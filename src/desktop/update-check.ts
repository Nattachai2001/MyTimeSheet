export interface UpdateManifest {
  version: string;
  downloadUrl: string;
  releaseNotes?: string;
}

export interface UpdateConfig {
  provider?: "github" | "manifest";
  manifestUrl?: string;
  owner?: string;
  repo?: string;
}

export type UpdateCheckResult =
  | { status: "disabled" }
  | { status: "up-to-date"; currentVersion: string; latestVersion: string }
  | {
      status: "available";
      currentVersion: string;
      latestVersion: string;
      downloadUrl: string;
      releaseNotes?: string;
    }
  | { status: "error"; currentVersion: string; message: string };

interface GithubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface GithubReleasePayload {
  tag_name?: string;
  name?: string;
  body?: string;
  assets?: GithubReleaseAsset[];
}

const GITHUB_USER_AGENT = "Sup-Timesheet-Automation";

export function parseSemver(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] < right[index] ? -1 : 1;
    }
  }
  return 0;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareSemver(latest, current) > 0;
}

export function normalizeReleaseVersion(tagOrName: string): string {
  return tagOrName.trim().replace(/^v/i, "");
}

export function pickWindowsInstallerAsset(assets: GithubReleaseAsset[] | undefined): GithubReleaseAsset | undefined {
  if (!assets?.length) return undefined;

  const installers = assets.filter(
    (asset) =>
      typeof asset.name === "string" &&
      asset.name.toLowerCase().endsWith(".exe") &&
      typeof asset.browser_download_url === "string"
  );
  if (!installers.length) return undefined;

  return (
    installers.find((asset) => asset.name?.toLowerCase().includes("setup")) ??
    installers.find((asset) => asset.name?.toLowerCase().includes("installer")) ??
    installers[0]
  );
}

export function parseGithubRelease(payload: unknown): UpdateManifest {
  if (!payload || typeof payload !== "object") {
    throw new Error("GitHub release payload is invalid");
  }

  const release = payload as GithubReleasePayload;
  const versionSource = release.tag_name ?? release.name;
  if (!versionSource?.trim()) {
    throw new Error("GitHub release is missing a version tag");
  }

  const asset = pickWindowsInstallerAsset(release.assets);
  if (!asset?.browser_download_url) {
    throw new Error("GitHub release has no Windows installer (.exe)");
  }

  return {
    version: normalizeReleaseVersion(versionSource),
    downloadUrl: asset.browser_download_url.trim(),
    releaseNotes: typeof release.body === "string" ? release.body.trim() : undefined
  };
}

function isValidManifest(value: unknown): value is UpdateManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as UpdateManifest;
  return (
    typeof manifest.version === "string" &&
    manifest.version.trim().length > 0 &&
    typeof manifest.downloadUrl === "string" &&
    manifest.downloadUrl.trim().length > 0 &&
    (manifest.releaseNotes === undefined || typeof manifest.releaseNotes === "string")
  );
}

function isUpdateConfigConfigured(config: UpdateConfig): boolean {
  if (config.provider === "github") {
    return Boolean(config.owner?.trim() && config.repo?.trim());
  }
  return Boolean(config.manifestUrl?.trim());
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": GITHUB_USER_AGENT
      }
    });
    if (!response.ok) {
      throw new Error(`Update check failed (${response.status})`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchManifest(manifestUrl: string, timeoutMs: number): Promise<UpdateManifest> {
  const payload = await fetchJson(manifestUrl, timeoutMs);
  if (!isValidManifest(payload)) {
    throw new Error("Update manifest is invalid");
  }
  return payload;
}

async function fetchGithubRelease(owner: string, repo: string, timeoutMs: number): Promise<UpdateManifest> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;
  const payload = await fetchJson(url, timeoutMs);
  return parseGithubRelease(payload);
}

function buildResult(currentVersion: string, manifest: UpdateManifest): UpdateCheckResult {
  const latestVersion = manifest.version.trim();
  if (!isNewerVersion(latestVersion, currentVersion)) {
    return { status: "up-to-date", currentVersion, latestVersion };
  }
  return {
    status: "available",
    currentVersion,
    latestVersion,
    downloadUrl: manifest.downloadUrl.trim(),
    releaseNotes: manifest.releaseNotes?.trim() || undefined
  };
}

export async function checkForUpdate(
  currentVersion: string,
  config: UpdateConfig,
  options: { timeoutMs?: number } = {}
): Promise<UpdateCheckResult> {
  if (!isUpdateConfigConfigured(config)) {
    return { status: "disabled" };
  }

  const timeoutMs = options.timeoutMs ?? 12_000;

  try {
    const manifest =
      config.provider === "github"
        ? await fetchGithubRelease(config.owner!.trim(), config.repo!.trim(), timeoutMs)
        : await fetchManifest(config.manifestUrl!.trim(), timeoutMs);
    return buildResult(currentVersion, manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update check failed";
    return { status: "error", currentVersion, message };
  }
}
