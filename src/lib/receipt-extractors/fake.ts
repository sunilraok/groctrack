import type {
  ReceiptExtractionInput,
  ReceiptExtractionResult,
  ReceiptExtractor,
} from "@/lib/receipt-extraction";

export class FakeReceiptExtractor implements ReceiptExtractor {
  async extract(input: ReceiptExtractionInput): Promise<ReceiptExtractionResult> {
    const marker = Array.from(input.bytes.slice(0, 4))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return {
      provider: "fake",
      model: "deterministic-v1",
      schemaVersion: 1,
      receipt: {
        merchant_name: "Local Test Market",
        purchased_at: null,
        currency: "USD",
        subtotal: null,
        discount: null,
        tax: null,
        total: null,
        lines: [
          {
            raw_description: `Test receipt ${marker}`,
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
      },
    };
  }
}
