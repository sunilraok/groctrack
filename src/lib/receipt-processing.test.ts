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

function authorizedClient(statuses = [receipt]) {
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
        download: vi.fn(async () => ({
          data: new Blob([new Uint8Array([0xff, 0xd8, 0xff]).buffer]),
          error: null,
        })),
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
});
