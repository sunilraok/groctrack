import { z } from "zod";
import Decimal from "decimal.js";

const nullableText = z.string().trim().max(500).nullable();
export const moneyPattern = "^(?:0|[1-9][0-9]{0,9})(?:\\.[0-9]{1,2})?$";
export const quantityPattern =
  "^(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,6})?$";
const moneySchema = z.string().regex(new RegExp(moneyPattern));
const quantitySchema = z
  .string()
  .regex(new RegExp(quantityPattern))
  .refine((value) => new Decimal(value).greaterThan(0));
const nullableAmount = moneySchema.nullable();
const nullableQuantity = quantitySchema.nullable();

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
    subtotal: { type: ["string", "null"], pattern: moneyPattern },
    discount: { type: ["string", "null"], pattern: moneyPattern },
    tax: { type: ["string", "null"], pattern: moneyPattern },
    total: { type: ["string", "null"], pattern: moneyPattern },
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
          quantity: { type: ["string", "null"], pattern: quantityPattern },
          unit: { type: ["string", "null"] },
          weight: { type: ["string", "null"], pattern: quantityPattern },
          weight_unit: { type: ["string", "null"] },
          unit_price: { type: ["string", "null"], pattern: moneyPattern },
          line_total: { type: ["string", "null"], pattern: moneyPattern },
          discount: { type: ["string", "null"], pattern: moneyPattern },
        },
      },
    },
  },
} as const;
