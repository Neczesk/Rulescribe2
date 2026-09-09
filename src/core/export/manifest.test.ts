import { describe, expect, it } from "vitest";
import { countEnabledExtras, describeExtras } from "./manifest";
import { defaultExtras } from "./options";

describe("extras summary", () => {
  it("counts and names the enabled extras", () => {
    const extras = { ...defaultExtras(), toc: true, glossary: true };
    expect(countEnabledExtras(extras)).toBe(2);
    expect(describeExtras(extras)).toBe("table of contents, keyword glossary");
  });

  it("is empty when nothing is enabled", () => {
    expect(countEnabledExtras(defaultExtras())).toBe(0);
    expect(describeExtras(defaultExtras())).toBe("");
  });
});
