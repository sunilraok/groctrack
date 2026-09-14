import { getServerEnv } from "@/lib/env";
import type { ReceiptExtractor } from "@/lib/receipt-extraction";
import { FakeReceiptExtractor } from "@/lib/receipt-extractors/fake";
import { GeminiReceiptExtractor } from "@/lib/receipt-extractors/gemini";

export function createReceiptExtractor(): ReceiptExtractor {
  const env = getServerEnv();
  const provider =
    env.RECEIPT_EXTRACTOR ?? (process.env.NODE_ENV === "production" ? "gemini" : "fake");
  if (provider === "fake") return new FakeReceiptExtractor();
  return new GeminiReceiptExtractor({
    apiKey: env.GEMINI_API_KEY ?? "",
    model: env.GEMINI_RECEIPT_MODEL,
  });
}
