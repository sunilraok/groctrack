import { describe, expect, it } from "vitest";
import { extractedReceiptSchema } from "@/lib/receipt-extraction";

const baseReceipt = {
  merchant_name: "Market",
  purchased_at: null,
  currency: "USD",
  subtotal: null,
  discount: null,
  tax: null,
  total: null,
  lines: [],
};

describe("extractedReceiptSchema", () => {
  it("accepts exact maximum-scale decimal strings", () => {
    const parsed = extractedReceiptSchema.parse({
      ...baseReceipt,
      total: "9999999999.99",
      lines: [
        {
          raw_description: "BULK ITEM",
          interpreted_description: null,
          product_code: null,
          quantity: "999999999998.123456",
          unit: "g",
          weight: null,
          weight_unit: null,
          unit_price: "9999999999.99",
          line_total: "9999999999.99",
          discount: "0",
        },
      ],
    });
    expect(parsed.lines[0].quantity).toBe("999999999998.123456");
  });

  it.each([
    "1e3",
    "NaN",
    "Infinity",
    "01.00",
    "1.001",
    "10000000000.00",
  ])("rejects invalid money evidence %s", (total) => {
    expect(extractedReceiptSchema.safeParse({ ...baseReceipt, total }).success).toBe(false);
  });

  it.each([
    "0",
    "-1",
    "1e3",
    "1.1234567",
    "1000000000000.1",
  ])("rejects invalid quantity evidence %s", (quantity) => {
    expect(
      extractedReceiptSchema.safeParse({
        ...baseReceipt,
        lines: [
          {
            raw_description: "ITEM",
            interpreted_description: null,
            product_code: null,
            quantity,
            unit: "each",
            weight: null,
            weight_unit: null,
            unit_price: null,
            line_total: null,
            discount: null,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
