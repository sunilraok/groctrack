import { z } from "zod";

const nullableText = z.string().trim().max(500).nullable();
const nullableAmount = z.number().finite().min(0).max(9999999999.99).nullable();
const nullableQuantity = z.number().finite().positive().max(999999999999).nullable();

export const extractedReceiptSchema = z
  .object({
    merchant_name: z.string().trim().min(1).max(120).nullable(),
    purchased_at: z.string().datetime({ offset: true }).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
    subtotal: nullableAmount,
    discount: nullableAmount,
    tax: nullableAmount,
    total: nullableAmount,
    lines: z
      .array(
        z
          .object({
            raw_description: z.string().trim().min(1).max(500),
            interpreted_description: nullableText,
            product_code: z.string().trim().max(120).nullable(),
            quantity: nullableQuantity,
            unit: z.string().trim().max(40).nullable(),
            weight: nullableQuantity,
            weight_unit: z.string().trim().max(40).nullable(),
            unit_price: nullableAmount,
            line_total: nullableAmount,
            discount: nullableAmount,
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

export type ExtractedReceipt = z.infer<typeof extractedReceiptSchema>;

export interface ReceiptExtractionInput {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
}

export interface ReceiptExtractionResult {
  provider: string;
  model: string;
  schemaVersion: 1;
  receipt: ExtractedReceipt;
}

export interface ReceiptExtractor {
  extract(input: ReceiptExtractionInput): Promise<ReceiptExtractionResult>;
}

export type ExtractionErrorKind =
  | "configuration"
  | "quota"
  | "rate_limit"
  | "transient"
  | "permanent";

export class ReceiptExtractionError extends Error {
  constructor(
    readonly kind: ExtractionErrorKind,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ReceiptExtractionError";
  }
}

export const receiptJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "merchant_name",
    "purchased_at",
    "currency",
    "subtotal",
    "discount",
    "tax",
    "total",
    "lines",
  ],
  properties: {
    merchant_name: { type: ["string", "null"] },
    purchased_at: {
      type: ["string", "null"],
      description: "ISO 8601 timestamp with an explicit UTC offset.",
    },
    currency: {
      type: ["string", "null"],
      pattern: "^[A-Z]{3}$",
    },
    subtotal: { type: ["number", "null"] },
    discount: { type: ["number", "null"] },
    tax: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
    lines: {
      type: "array",
      maxItems: 500,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "raw_description",
          "interpreted_description",
          "product_code",
          "quantity",
          "unit",
          "weight",
          "weight_unit",
          "unit_price",
          "line_total",
          "discount",
        ],
        properties: {
          raw_description: { type: "string" },
          interpreted_description: { type: ["string", "null"] },
          product_code: { type: ["string", "null"] },
          quantity: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          weight: { type: ["number", "null"] },
          weight_unit: { type: ["string", "null"] },
          unit_price: { type: ["number", "null"] },
          line_total: { type: ["number", "null"] },
          discount: { type: ["number", "null"] },
        },
      },
    },
  },
} as const;
