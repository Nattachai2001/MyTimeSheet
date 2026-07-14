import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatTimesheetPeriod,
  resolveTimesheetFilename,
  resolveTimesheetOutputPath
} from "../src/timesheet/output-path.js";

describe("output-path", () => {
  it("formats the SkillLane period code", () => {
    expect(formatTimesheetPeriod("2026-06")).toBe("202606");
    expect(formatTimesheetPeriod("2026-07")).toBe("202607");
  });

  it("builds the SkillLane PDF filename", () => {
    expect(
      resolveTimesheetFilename({
        site: "Skilllane",
        month: "2026-06",
        staffName: "Nattachai Satitchai",
        extension: "pdf"
      })
    ).toBe("Skilllane - TimeSheet 202606 - Nattachai Satitchai.pdf");
  });

  it("places outputs under the month folder", () => {
    expect(
      resolveTimesheetOutputPath({
        rootDirectory: "C:/data",
        month: "2026-06",
        site: "Skilllane",
        staffName: "Nattachai Satitchai",
        extension: "pdf"
      })
    ).toBe(path.join("C:/data", "output", "2026", "06", "Skilllane - TimeSheet 202606 - Nattachai Satitchai.pdf"));
  });
});
