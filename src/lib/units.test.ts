import { describe, expect, it } from "vitest";
import { convertQuantity, formatQuantity, toBaseQuantity } from "./units";

describe("unit conversion", () => {
  it("normalizes kilograms to grams without floating point drift", () => {
    expect(toBaseQuantity("1.25", "kg").toString()).toBe("1250");
  });

  it("converts volume units", () => {
    expect(convertQuantity("2", "l", "ml").toString()).toBe("2000");
  });

  it("rejects incompatible dimensions", () => {
    expect(() => convertQuantity(1, "kg", "l")).toThrow(
      "Cannot convert kg to l",
    );
  });

  it("uses a readable larger unit", () => {
    expect(formatQuantity("2500", "mass")).toBe("2.5 kg");
  });
});
