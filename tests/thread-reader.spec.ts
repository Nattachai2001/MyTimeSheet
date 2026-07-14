import { describe, expect, it } from "vitest";

import { extractResponseText } from "../src/slack/thread-reader.js";
import { parseSupResponse } from "../src/slack/sup-parser.js";

describe("extractResponseText", () => {
  it("extracts the selected user's Sup! block from a visible Slack thread", () => {
    const pageText = `
      team-art-standup
      Friday, July 10th
      Thread
      Sup APP Friday at 9:12 AM
      Hello team, submitted responses for Art Team Standup.
      Pluem APP Friday at 9:12 AM
      Pluem posted an update for Art Team Standup report.
      Yesterday
      [Migrate]
      • Check existing script working #help P'Ning to pre-setup
      Added by Standup & PTO tracking Bot | Sup
      Today
      [Migrate]
      • Check existing script working #help P'Ning to pre-setup
      • Migrate new script from Automated-test to monorepo
      Added by Standup & PTO tracking Bot | Sup
      Bigboss APP Friday at 9:22 AM
      Bigboss posted an update for Art Team Standup report.
      Yesterday
      Meeting
    `;

    const parsed = parseSupResponse(extractResponseText(pageText, "Pluem"));
    expect(parsed.yesterdayItems).toEqual([
      "[Migrate]",
      "Check existing script working #help P'Ning to pre-setup"
    ]);
    expect(parsed.todayItems).toEqual([
      "[Migrate]",
      "Check existing script working #help P'Ning to pre-setup",
      "Migrate new script from Automated-test to monorepo"
    ]);
  });

  it("stops before the next Slack message when the author and APP timestamp are split", () => {
    const pageText = `
      Pluem
      APP  Friday at 9:12 AM
      Pluem posted an update for Art Team Standup report.
      Yesterday
      [Migrate]
      Check existing script working
      Today
      [Migrate]
      Migrate new script from Automated-test to monorepo
      Bigboss
      APP  Friday at 9:22 AM
      Bigboss posted an update for Art Team Standup report.
      Yesterday
      Meeting
    `;

    const parsed = parseSupResponse(extractResponseText(pageText, "Pluem"));
    expect(parsed.todayItems).toEqual([
      "[Migrate]",
      "Migrate new script from Automated-test to monorepo"
    ]);
  });

  it("uses the selected user's weekday instead of unrelated channel date headings", () => {
    const pageText = `
      Tuesday, July 7th
      Wednesday, July 8th
      Friday, July 10th
      Pluem
      APP  Thursday at 9:35 AM
      Pluem posted an update for Art Team Standup report.
      Yesterday
      [Migrate]
      Check existing script working #help P'Ning to pre-setup
      Today
      [Prepare]
      List change to migrate from automated-test
      Korn
      APP  Thursday at 9:45 AM
      Korn posted an update for Art Team Standup report.
    `;

    const parsed = parseSupResponse(extractResponseText(pageText, "Pluem", "2026-07-09"));
    expect(parsed.todayItems).toEqual(["[Prepare]", "List change to migrate from automated-test"]);
  });
});
