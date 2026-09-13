import { describe, expect, it } from "vitest";
import {
  convertQuantity,
  formatQuantity,
  isInventoryUnit,
  isLowStock,
  toBaseQuantity,
} from "./units";

describe("unit conversion", () => {
  it("normalizes decimal kilograms without floating-point drift", () => {
    expect(toBaseQuantity("1.234567", "kg").toString()).toBe("1234.567");
  });

  it("converts exact volume ratios", () => {
    expect(convertQuantity("2.5", "tbsp", "ml").toString()).toBe(
      "36.966911953125",
    );
  });

  it("converts count quantities", () => {
    expect(toBaseQuantity("1.25", "dozen").toString()).toBe("15");
  });

  it("rejects incompatible dimensions", () => {
    expect(() => convertQuantity("1", "kg", "l")).toThrow(
      "Cannot convert kg to l",
    );
  });

  it("does not accept inherited object properties as units", () => {
    expect(isInventoryUnit("toString")).toBe(false);
  });

  it("uses a readable larger unit", () => {
    expect(formatQuantity("2500", "mass")).toBe("2.5 kg");
  });

  it("compares low-stock decimals without coercing to numbers", () => {
    expect(isLowStock("0.100000", "0.100001")).toBe(true);
    expect(isLowStock("0.100002", "0.100001")).toBe(false);
    expect(isLowStock("0", null)).toBe(false);
  });
});
