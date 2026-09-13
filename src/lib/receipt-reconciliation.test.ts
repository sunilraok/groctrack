import { describe, expect, it } from "vitest";
import { reconcileReceipt } from "@/lib/receipt-reconciliation";

describe("reconcileReceipt", () => {
  it("preserves null evidence and emits deterministic ambiguity warnings", () => {
    const result = reconcileReceipt({
      merchant_name: null,
      purchased_at: null,
      currency: null,
      subtotal: 10,
      discount: 0,
      tax: 1,
      total: 12,
      lines: [
        {
          raw_description: "UNKNOWN ITEM",
          interpreted_description: null,
          product_code: null,
          quantity: null,
          unit: null,
          weight: null,
          weight_unit: null,
          unit_price: null,
          line_total: null,
          discount: null,
        },
      ],
    });

    expect(result.warnings).toEqual([
      "merchant_missing",
      "purchase_time_missing",
      "receipt_total_mismatch",
    ]);
    expect(result.lines[0]).toMatchObject({
      raw_description: "UNKNOWN ITEM",
      quantity: null,
      is_ambiguous: true,
      validation_warnings: ["insufficient_line_detail"],
    });
  });

  it("flags a line sum that does not reconcile", () => {
    const result = reconcileReceipt({
      merchant_name: "Market",
      purchased_at: "2026-09-13T12:00:00-07:00",
      currency: "USD",
      subtotal: 9,
      discount: null,
      tax: 1,
      total: 10,
      lines: [
        {
          raw_description: "APPLE",
          interpreted_description: "Apple",
          product_code: null,
          quantity: 1,
          unit: "each",
          weight: null,
          weight_unit: null,
          unit_price: 8,
          line_total: 8,
          discount: null,
        },
      ],
    });
    expect(result.warnings).toEqual(["line_total_mismatch"]);
  });
});
