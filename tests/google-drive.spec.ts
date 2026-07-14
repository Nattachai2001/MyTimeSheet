import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  APP_DATA_FOLDER,
  accountLabel,
  extractEmailFromSyncRoot,
  extractMountLetter,
  extractPathsFromRegistryBinary,
  isPathInside,
  matchesGoogleDriveSyncFolder,
  resolveAppDataPath
} from "../src/desktop/google-drive.js";

describe("google-drive", () => {
  it("builds the app data folder under the sync root", () => {
    expect(resolveAppDataPath("G:\\My Drive")).toBe(path.join("G:\\My Drive", APP_DATA_FOLDER));
  });

  it("detects when storage lives inside the Google Drive sync folder", () => {
    expect(isPathInside("G:\\My Drive\\SupTimesheetAutomation", "G:\\My Drive")).toBe(true);
    expect(isPathInside("C:\\Users\\USER\\Documents\\SupTimesheetAutomation", "G:\\My Drive")).toBe(false);
  });

  it("matches mirror-mode sync folders that equal the storage root", () => {
    expect(matchesGoogleDriveSyncFolder("D:\\Downloads\\TimeSheet", ["D:\\Downloads\\TimeSheet"])).toBe(true);
    expect(matchesGoogleDriveSyncFolder("D:\\Downloads\\TimeSheet\\inbox", ["D:\\Downloads\\TimeSheet"])).toBe(true);
    expect(matchesGoogleDriveSyncFolder("C:\\Local\\Data", ["D:\\Downloads\\TimeSheet"])).toBe(false);
  });

  it("extracts mirror-mode sync paths from registry binary", () => {
    const raw =
      "0A350A170A153131343137333132313236363335363038313130381202473A1A16443A5C446F776E6C6F6164735C54696D655368656574";
    expect(extractPathsFromRegistryBinary(raw)).toContain("D:\\Downloads\\TimeSheet");
  });

  it("extracts email from mirrored GoogleDrive path", () => {
    expect(
      extractEmailFromSyncRoot("C:\\Users\\USER\\GoogleDrive-work@company.com\\My Drive")
    ).toBe("work@company.com");
  });

  it("extracts mount letters from drive paths", () => {
    expect(extractMountLetter("H:\\My Drive")).toBe("H");
    expect(extractMountLetter("g:\\My Drive\\SupTimesheetAutomation")).toBe("G");
  });

  it("prefers email for account labels", () => {
    expect(accountLabel({ email: "a@b.com", syncRoot: "H:\\My Drive" })).toBe("a@b.com");
    expect(accountLabel({ syncRoot: "H:\\My Drive" })).toBe("H:\\My Drive");
  });

  it("treats secondary drive roots as valid sync folders", () => {
    expect(
      matchesGoogleDriveSyncFolder("H:\\My Drive\\SupTimesheetAutomation", [
        "G:\\My Drive",
        "H:\\My Drive"
      ])
    ).toBe(true);
  });
});
