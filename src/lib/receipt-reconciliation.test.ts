import { describe, expect, it } from "vitest";
import { reconcileReceipt } from "@/lib/receipt-reconciliation";

describe("reconcileReceipt", () => {
  it("preserves null evidence and emits deterministic ambiguity warnings", () => {
    const result = reconcileReceipt({
      merchant_name: null,
      purchased_at: null,
      currency: null,
      subtotal: "10.00",
      discount: "0",
      tax: "1.00",
      total: "12.00",
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
      subtotal: "9.00",
      discount: null,
      tax: "1.00",
      total: "10.00",
      lines: [
        {
          raw_description: "APPLE",
          interpreted_description: "Apple",
          product_code: null,
          quantity: "1",
          unit: "each",
          weight: null,
          weight_unit: null,
          unit_price: "8.00",
          line_total: "8.00",
          discount: null,
        },
      ],
    });
    expect(result.warnings).toEqual(["line_total_mismatch"]);
  });

  it("preserves maximum exact quantity evidence without number coercion", () => {
    const result = reconcileReceipt({
      merchant_name: "Market",
      purchased_at: null,
      currency: "USD",
      subtotal: "9999999999.99",
      discount: null,
      tax: null,
      total: "9999999999.99",
      lines: [
        {
          raw_description: "BULK",
          interpreted_description: null,
          product_code: null,
          quantity: "999999999998.123456",
          unit: "g",
          weight: null,
          weight_unit: null,
          unit_price: null,
          line_total: "9999999999.99",
          discount: null,
        },
      ],
    });
    expect(result.lines[0].quantity).toBe("999999999998.123456");
    expect(result.receipt.total).toBe("9999999999.99");
  });
});
