import { describe, expect, it } from "vitest";

import {
  compareSemver,
  isNewerVersion,
  normalizeReleaseVersion,
  parseGithubRelease,
  parseSemver,
  pickWindowsInstallerAsset
} from "../src/desktop/update-check.js";

describe("update-check", () => {
  it("parses semver prefixes", () => {
    expect(parseSemver("0.2.4")).toEqual([0, 2, 4]);
    expect(parseSemver("v1.10.0")).toEqual([1, 10, 0]);
  });

  it("compares versions", () => {
    expect(compareSemver("0.2.5", "0.2.4")).toBe(1);
    expect(compareSemver("0.2.4", "0.2.5")).toBe(-1);
    expect(compareSemver("0.2.4", "0.2.4")).toBe(0);
    expect(compareSemver("1.0.0", "0.9.9")).toBe(1);
  });

  it("detects newer versions", () => {
    expect(isNewerVersion("0.2.5", "0.2.4")).toBe(true);
    expect(isNewerVersion("0.2.4", "0.2.4")).toBe(false);
    expect(isNewerVersion("0.2.3", "0.2.4")).toBe(false);
  });

  it("normalizes GitHub release tags", () => {
    expect(normalizeReleaseVersion("v0.2.5")).toBe("0.2.5");
    expect(normalizeReleaseVersion("0.2.5")).toBe("0.2.5");
  });

  it("prefers setup installer assets", () => {
    const assets = [
      { name: "checksums.txt", browser_download_url: "https://example.com/checksums.txt" },
      { name: "Sup Timesheet Automation Setup 0.2.5.exe", browser_download_url: "https://example.com/setup.exe" }
    ];
    expect(pickWindowsInstallerAsset(assets)?.browser_download_url).toBe("https://example.com/setup.exe");
  });

  it("parses GitHub release payloads", () => {
    const manifest = parseGithubRelease({
      tag_name: "v0.2.5",
      body: "Bug fixes",
      assets: [
        {
          name: "Sup Timesheet Automation Setup 0.2.5.exe",
          browser_download_url: "https://github.com/example/repo/releases/download/v0.2.5/setup.exe"
        }
      ]
    });

    expect(manifest).toEqual({
      version: "0.2.5",
      downloadUrl: "https://github.com/example/repo/releases/download/v0.2.5/setup.exe",
      releaseNotes: "Bug fixes"
    });
  });
});
