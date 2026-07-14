import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  decodeHtmlEntities,
  importSupExportFile,
  parseSupExportDate,
  parseSupExportMatrix
} from "../src/standup/sup-export-importer.js";

const samplePath = path.resolve(
  "d:/Downloads/Art_Team_Standup-2026-07-12-44cf1d1a-564e-428f-8c99-e19a54a4db38.xlsx"
);

describe("sup export importer", () => {
  it("parses Sup dashboard date formats", () => {
    expect(parseSupExportDate("Jun 15, 2026")).toBe("2026-06-15");
    expect(parseSupExportDate("Jun 30, 2026")).toBe("2026-06-30");
  });

  it("decodes html entities from export text", () => {
    expect(decodeHtmlEntities("skill &amp; agent")).toBe("skill & agent");
  });

  it("parses a matrix shaped like the Sup export", () => {
    const parsed = parseSupExportMatrix([
      ["Followup name", "Art Team Standup"],
      ["User name", "Pluem"],
      ["Date", "Submission time", "Yesterday", "Today"],
      ["Jun 15, 2026", "Jun 15, 2026 12:00 +0700", "[Testing] A", "[Meeting] B"],
      ["Jun 16, 2026", "", "[Meeting] B", "[Develop] C"]
    ]);

    expect(parsed.exportUserName).toBe("Pluem");
    expect(parsed.followupName).toBe("Art Team Standup");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.reportDate).toBe("2026-06-15");
    expect(parsed.rows[0]?.yesterdayRaw).toContain("[Testing]");
  });

  it.skipIf(!existsSync(samplePath))("reads rows from a real Sup export", async () => {
    const result = await importSupExportFile({
      filePath: samplePath,
      rootDirectory: path.resolve("tmp/tests/sup-import-read"),
      displayName: "Pluem",
      workspaceUrl: "https://example.slack.com",
      channelUrl: "https://example.slack.com/archives/C123"
    });

    expect(result.exportUserName).toBe("Pluem");
    expect(result.followupName).toBe("Art Team Standup");
    expect(result.imported).toBeGreaterThanOrEqual(10);
    expect(result.dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.skipIf(!existsSync(samplePath))("imports rows into inbox storage", async () => {
    const rootDirectory = path.resolve("tmp/tests/sup-import-data");
    const result = await importSupExportFile({
      filePath: samplePath,
      rootDirectory,
      displayName: "Pluem",
      workspaceUrl: "https://example.slack.com",
      channelUrl: "https://example.slack.com/archives/C123"
    });

    expect(result.imported).toBeGreaterThanOrEqual(10);
    expect(result.months).toContain("2026-06");
    expect(result.created + result.updated + result.unchanged).toBe(result.imported);
  });
});
