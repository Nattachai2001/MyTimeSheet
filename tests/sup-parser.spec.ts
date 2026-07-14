import { describe, expect, it } from "vitest";

import { normalizeItems, parseSupResponse } from "../src/slack/sup-parser.js";

describe("parseSupResponse", () => {
  it("extracts yesterday and today sections while preserving category tags", () => {
    const parsed = parseSupResponse(`
      Yesterday
      [Meeting]
      Sprint planning
      [Testing]
      Regression 3.5

      Today
      [Develop]
      Pre-enrollment test script
    `);

    expect(parsed.yesterdayItems).toEqual([
      "[Meeting]",
      "Sprint planning",
      "[Testing]",
      "Regression 3.5"
    ]);
    expect(parsed.todayItems).toEqual(["[Develop]", "Pre-enrollment test script"]);
  });

  it("normalizes bullets and removes duplicate items", () => {
    expect(
      normalizeItems(`
        - Review code
        * Review code
        1. Fix test
      `)
    ).toEqual(["Review code", "Fix test"]);
  });
});
