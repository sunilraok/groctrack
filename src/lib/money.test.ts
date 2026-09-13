import { describe, expect, it } from "vitest";
import { reconcileReceipt } from "./money";

describe("receipt reconciliation", () => {
  it("accepts a receipt within a two-cent tolerance", () => {
    expect(
      reconcileReceipt({
        subtotal: "10.00",
        discount: "1.00",
        tax: "0.50",
        total: "9.50",
        lineTotals: ["4.00", "6.00"],
      }),
    ).toEqual([]);
  });

  it("reports line and total mismatches", () => {
    expect(
      reconcileReceipt({
        subtotal: "12.00",
        discount: null,
        tax: "1.00",
        total: "20.00",
        lineTotals: ["4.00", "6.00"],
      }),
    ).toHaveLength(2);
  });
});
