import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReceiptExtractor } from "@/lib/receipt-extraction";
import { processReceipt } from "@/lib/receipt-processing";

describe("processReceipt", () => {
  it("does not call the provider when another extraction owns the receipt", async () => {
    const single = vi.fn(async () => ({
      data: {
        id: "50000000-0000-0000-0000-000000000001",
        image_path: "household/user/upload.jpg",
        content_type: "image/jpeg",
        status: "processing",
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    const authorizedClient = {
      from: vi.fn(() => ({ select })),
    } as unknown as SupabaseClient;
    const admin = {
      rpc: vi.fn(async () => ({ data: false, error: null })),
    } as unknown as SupabaseClient;
    const extractor = {
      extract: vi.fn(),
    } as unknown as ReceiptExtractor;

    await expect(
      processReceipt({
        admin,
        authorizedClient,
        extractor,
        receiptId: "50000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({ status: "processing" });
    expect(extractor.extract).not.toHaveBeenCalled();
  });
});
