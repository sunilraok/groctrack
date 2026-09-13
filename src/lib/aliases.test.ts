import { describe, expect, it } from "vitest";
import { normalizeReceiptAlias } from "./aliases";

describe("normalizeReceiptAlias", () => {
  it("normalizes punctuation, case, and spacing", () => {
    expect(normalizeReceiptAlias("  Tur-Dal 1KG ")).toBe("TUR DAL 1KG");
  });

  it("retains international letters and digits", () => {
    expect(normalizeReceiptAlias("Café #42")).toBe("CAFÉ 42");
  });
});
