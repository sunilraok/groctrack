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

  it("classifies provider-reported quota exhaustion even with retry headers", async () => {
    const extractor = new GeminiReceiptExtractor({
      apiKey: "secret",
      model: "gemini-test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: {
              status: "RESOURCE_EXHAUSTED",
              details: [{ reason: "DAILY_QUOTA_EXCEEDED" }],
            },
          }),
          {
          status: 429,
          headers: { "retry-after": "10" },
          },
        ),
    });

    await expect(
      extractor.extract({
        bytes: new Uint8Array([0xff, 0xd8, 0xff]),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      kind: "quota",
      retryable: true,
      message: "Extraction quota is exhausted.",
    } satisfies Partial<ReceiptExtractionError>);
  });

  it("classifies provider-reported rate limits without relying on headers", async () => {
    const extractor = new GeminiReceiptExtractor({
      apiKey: "secret",
      model: "gemini-test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: {
              status: "RESOURCE_EXHAUSTED",
              details: [{ reason: "RATE_LIMIT_EXCEEDED" }],
            },
          }),
          { status: 429 },
        ),
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

  it("uses a safe transient fallback for unknown bounded 429 metadata", async () => {
    const extractor = new GeminiReceiptExtractor({
      apiKey: "secret",
      model: "gemini-test",
      fetch: async () =>
        new Response(
          JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }),
          { status: 429 },
        ),
    });
    await expect(
      extractor.extract({
        bytes: new Uint8Array([0xff, 0xd8, 0xff]),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ kind: "transient", retryable: true });
  });

  it("sends PDFs through the native inline-data path", async () => {
    let body: string | undefined;
    const extractor = new GeminiReceiptExtractor({
      apiKey: "secret",
      model: "gemini-test",
      fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = String(init?.body);
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(validReceipt) }] } }],
          }),
        );
      }) as typeof fetch,
    });
    await extractor.extract({
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      contentType: "application/pdf",
    });
    expect(JSON.parse(body ?? "{}")).toMatchObject({
      contents: [
        {
          parts: [
            expect.anything(),
            { inlineData: { mimeType: "application/pdf" } },
          ],
        },
      ],
    });
  });

  it("rejects malformed and oversized provider envelopes", async () => {
    const malformed = new GeminiReceiptExtractor({
      apiKey: "secret",
      model: "gemini-test",
      fetch: async () => new Response(JSON.stringify({ candidates: [] })),
    });
    await expect(
      malformed.extract({
        bytes: new Uint8Array([1]),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ kind: "transient" });

    const oversized = new GeminiReceiptExtractor({
      apiKey: "secret",
      model: "gemini-test",
      fetch: async () => new Response("x".repeat(2 * 1024 * 1024 + 1)),
    });
    await expect(
      oversized.extract({
        bytes: new Uint8Array([1]),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ kind: "transient" });
  });

  it("rejects invalid JSON and schema-invalid structured results", async () => {
    const envelope = (text: string) =>
      JSON.stringify({
        candidates: [{ content: { parts: [{ text }] } }],
      });
    const invalidJson = new GeminiReceiptExtractor({
      apiKey: "secret",
      model: "gemini-test",
      fetch: async () => new Response(envelope("{not-json")),
    });
    await expect(
      invalidJson.extract({
        bytes: new Uint8Array([1]),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ kind: "permanent", retryable: false });

    const invalidSchema = new GeminiReceiptExtractor({
      apiKey: "secret",
      model: "gemini-test",
      fetch: async () =>
        new Response(envelope(JSON.stringify({ ...validReceipt, total: 12.34 }))),
    });
    await expect(
      invalidSchema.extract({
        bytes: new Uint8Array([1]),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ kind: "permanent", retryable: false });
  });

  it.each([408, 500, 503])(
    "classifies HTTP %s as retryable transient failure",
    async (status) => {
      const extractor = new GeminiReceiptExtractor({
        apiKey: "secret",
        model: "gemini-test",
        fetch: async () => new Response("discarded", { status }),
      });
      await expect(
        extractor.extract({
          bytes: new Uint8Array([1]),
          contentType: "image/jpeg",
        }),
      ).rejects.toMatchObject({ kind: "transient", retryable: true });
    },
  );

  it.each([400, 401, 403, 422])(
    "classifies ordinary HTTP %s as permanent failure",
    async (status) => {
      const extractor = new GeminiReceiptExtractor({
        apiKey: "secret",
        model: "gemini-test",
        fetch: async () => new Response("discarded", { status }),
      });
      await expect(
        extractor.extract({
          bytes: new Uint8Array([1]),
          contentType: "image/jpeg",
        }),
      ).rejects.toMatchObject({ kind: "permanent", retryable: false });
    },
  );

  it("classifies aborts and network errors as retryable without logging inputs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const timeout = new GeminiReceiptExtractor({
      apiKey: "super-secret-api-key",
      model: "gemini-test",
      timeoutMs: 1,
      fetch: ((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        })) as typeof fetch,
    });
    await expect(
      timeout.extract({
        bytes: new TextEncoder().encode("private-source-bytes"),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ kind: "transient", retryable: true });

    const network = new GeminiReceiptExtractor({
      apiKey: "super-secret-api-key",
      model: "gemini-test",
      fetch: async () => {
        throw new Error("network response with sensitive body");
      },
    });
    await expect(
      network.extract({
        bytes: new TextEncoder().encode("private-source-bytes"),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ kind: "transient", retryable: true });
    expect([...info.mock.calls, ...warn.mock.calls].flat().join(" ")).not.toMatch(
      /super-secret|private-source|sensitive body/,
    );
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
