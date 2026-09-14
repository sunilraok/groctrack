import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ReceiptExtractionError,
  type ReceiptExtractor,
} from "@/lib/receipt-extraction";
import { processReceipt } from "@/lib/receipt-processing";

const receipt = {
  id: "50000000-0000-0000-0000-000000000001",
  image_path: "household/user/upload.jpg",
  content_type: "image/jpeg",
  status: "processing",
};

function authorizedClient(
  statuses = [receipt],
  download: { data: Blob | null; error: unknown } = {
    data: new Blob([new Uint8Array([0xff, 0xd8, 0xff]).buffer]),
    error: null,
  },
) {
  let read = 0;
  const single = vi.fn(async () => ({
    data: statuses[Math.min(read++, statuses.length - 1)],
    error: null,
  }));
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return {
    from: vi.fn(() => ({ select })),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => download),
      })),
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("processReceipt", () => {
  it("does not call the provider when another extraction owns the receipt", async () => {
    const client = authorizedClient();
    const admin = {
      rpc: vi.fn(async () => ({ data: false, error: null })),
    } as unknown as SupabaseClient;
    const extractor = {
      extract: vi.fn(),
    } as unknown as ReceiptExtractor;

    await expect(
      processReceipt({
        admin,
        authorizedClient: client,
        extractor,
        receiptId: "50000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({ status: "processing" });
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it("reclaims a stale processing lease and never writes inventory", async () => {
    const client = authorizedClient();
    const admin = {
      from: vi.fn(),
      rpc: vi.fn(async (name: string) => ({
        data:
          name === "claim_receipt_extraction" ||
          name === "complete_receipt_extraction",
        error: null,
      })),
    } as unknown as SupabaseClient;
    const extractor = {
      extract: vi.fn(async () => ({
        provider: "fake",
        model: "deterministic-v1",
        schemaVersion: 1 as const,
        receipt: {
          merchant_name: null,
          purchased_at: null,
          currency: null,
          subtotal: null,
          discount: null,
          tax: null,
          total: null,
          lines: [],
        },
      })),
    } satisfies ReceiptExtractor;

    await expect(
      processReceipt({
        admin,
        authorizedClient: client,
        extractor,
        receiptId: receipt.id,
      }),
    ).resolves.toEqual({ status: "review_ready" });
    expect(extractor.extract).toHaveBeenCalledOnce();
    expect(admin.rpc).toHaveBeenCalledWith(
      "complete_receipt_extraction",
      expect.anything(),
    );
    expect(admin.from).not.toHaveBeenCalled();
    expect(
      vi.mocked(console.info).mock.calls.flat().join(" "),
    ).not.toMatch(/upload\.jpg|private|Local Test Market/);
  });

  it("returns live state when a stale worker loses its run token", async () => {
    const client = authorizedClient([
      receipt,
      { ...receipt, status: "review_ready" },
    ]);
    const admin = {
      rpc: vi.fn(async (name: string) => {
        if (name === "claim_receipt_extraction") {
          return { data: true, error: null };
        }
        return { data: false, error: null };
      }),
    } as unknown as SupabaseClient;
    const extractor = {
      extract: vi.fn(async () => {
        throw new ReceiptExtractionError("transient", "Temporary.", true);
      }),
    } satisfies ReceiptExtractor;

    await expect(
      processReceipt({
        admin,
        authorizedClient: client,
        extractor,
        receiptId: receipt.id,
      }),
    ).resolves.toEqual({ status: "review_ready" });
  });

  it("returns live state when stale completion loses its run token", async () => {
    const client = authorizedClient([
      receipt,
      { ...receipt, status: "review_ready" },
    ]);
    const admin = {
      rpc: vi.fn(async (name: string) => ({
        data: name === "claim_receipt_extraction",
        error: null,
      })),
    } as unknown as SupabaseClient;
    const extractor = {
      extract: vi.fn(async () => ({
        provider: "fake",
        model: "deterministic-v1",
        schemaVersion: 1 as const,
        receipt: {
          merchant_name: null,
          purchased_at: null,
          currency: null,
          subtotal: null,
          discount: null,
          tax: null,
          total: null,
          lines: [],
        },
      })),
    } satisfies ReceiptExtractor;
    await expect(
      processReceipt({
        admin,
        authorizedClient: client,
        extractor,
        receiptId: receipt.id,
      }),
    ).resolves.toEqual({ status: "review_ready" });
  });

  it("records missing private objects as permanent failures", async () => {
    const client = authorizedClient([receipt], {
      data: null,
      error: { message: "private storage detail" },
    });
    const admin = {
      rpc: vi.fn(async (name: string) => ({
        data:
          name === "claim_receipt_extraction" ||
          name === "fail_receipt_extraction",
        error: null,
      })),
    } as unknown as SupabaseClient;
    const extractor = { extract: vi.fn() } as unknown as ReceiptExtractor;

    await expect(
      processReceipt({
        admin,
        authorizedClient: client,
        extractor,
        receiptId: receipt.id,
      }),
    ).resolves.toEqual({ status: "failed", retryable: false });
    expect(admin.rpc).toHaveBeenCalledWith(
      "fail_receipt_extraction",
      expect.objectContaining({
        error_code: "permanent",
        safe_error: "The private receipt file is unavailable.",
      }),
    );
    expect(extractor.extract).not.toHaveBeenCalled();
    expect(
      vi.mocked(console.warn).mock.calls.flat().join(" "),
    ).not.toContain("private storage detail");
  });

  it("turns completion failures into safe retryable failures", async () => {
    const client = authorizedClient();
    const admin = {
      rpc: vi.fn(async (name: string) => {
        if (name === "claim_receipt_extraction") {
          return { data: true, error: null };
        }
        if (name === "complete_receipt_extraction") {
          return { data: null, error: { message: "database payload detail" } };
        }
        return { data: true, error: null };
      }),
    } as unknown as SupabaseClient;
    const extractor = {
      extract: vi.fn(async () => ({
        provider: "fake",
        model: "deterministic-v1",
        schemaVersion: 1 as const,
        receipt: {
          merchant_name: "Private Merchant",
          purchased_at: null,
          currency: null,
          subtotal: null,
          discount: null,
          tax: null,
          total: null,
          lines: [],
        },
      })),
    } satisfies ReceiptExtractor;

    await expect(
      processReceipt({
        admin,
        authorizedClient: client,
        extractor,
        receiptId: receipt.id,
      }),
    ).resolves.toEqual({ status: "failed", retryable: true });
    expect(admin.rpc).toHaveBeenCalledWith(
      "fail_receipt_extraction",
      expect.objectContaining({
        error_code: "transient",
        safe_error: "Receipt extraction failed unexpectedly.",
      }),
    );
    expect(
      vi.mocked(console.warn).mock.calls.flat().join(" "),
    ).not.toMatch(/Private Merchant|database payload detail|upload\.jpg/);
  });

  it("surfaces failure-recording errors without logging sensitive causes", async () => {
    const client = authorizedClient();
    const admin = {
      rpc: vi.fn(async (name: string) =>
        name === "claim_receipt_extraction"
          ? { data: true, error: null }
          : { data: null, error: { message: "sensitive database detail" } },
      ),
    } as unknown as SupabaseClient;
    const extractor = {
      extract: vi.fn(async () => {
        throw new Error("provider response body secret");
      }),
    } satisfies ReceiptExtractor;

    await expect(
      processReceipt({
        admin,
        authorizedClient: client,
        extractor,
        receiptId: receipt.id,
      }),
    ).rejects.toThrow("Unable to record receipt extraction failure.");
    expect(
      [
        ...vi.mocked(console.info).mock.calls,
        ...vi.mocked(console.warn).mock.calls,
      ]
        .flat()
        .join(" "),
    ).not.toMatch(/provider response|sensitive database|upload\.jpg/);
  });
});
