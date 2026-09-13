import { describe, expect, it, vi } from "vitest";
import { ReceiptExtractionError } from "@/lib/receipt-extraction";
import { GeminiReceiptExtractor } from "@/lib/receipt-extractors/gemini";

const validReceipt = {
  merchant_name: "Market",
  purchased_at: null,
  currency: "USD",
  subtotal: null,
  discount: null,
  tax: null,
  total: null,
  lines: [],
};

describe("GeminiReceiptExtractor", () => {
  it("uses a fixed provider origin and native structured output", async () => {
    let requestedUrl: string | URL | Request | undefined;
    let requestedOptions: RequestInit | undefined;
    const request = vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestedUrl = input;
      requestedOptions = init;
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(validReceipt) }] } }],
        }),
        { status: 200 },
      );
    });
    const extractor = new GeminiReceiptExtractor({
      apiKey: "secret",
      model: "gemini-test",
      fetch: request as typeof fetch,
    });
    const result = await extractor.extract({
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      contentType: "image/jpeg",
    });

    expect(requestedUrl).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
    );
    expect(JSON.parse(String(requestedOptions?.body))).toMatchObject({
      generationConfig: { responseMimeType: "application/json" },
    });
    expect(result.receipt).toEqual(validReceipt);
  });

  it("classifies retryable rate limits without exposing provider payloads", async () => {
    const extractor = new GeminiReceiptExtractor({
      apiKey: "secret",
      model: "gemini-test",
      fetch: async () =>
        new Response("sensitive provider detail", {
          status: 429,
          headers: { "retry-after": "10" },
        }),
    });

    await expect(
      extractor.extract({
        bytes: new Uint8Array([0xff, 0xd8, 0xff]),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      kind: "rate_limit",
      retryable: true,
      message: "Extraction is rate limited.",
    } satisfies Partial<ReceiptExtractionError>);
  });

  it("rejects model strings that could control the provider URL", () => {
    expect(
      () =>
        new GeminiReceiptExtractor({
          apiKey: "secret",
          model: "../attacker",
        }),
    ).toThrow("configured extraction model is invalid");
  });
});
