import sharp from "sharp";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { createReceiptExtractor } from "@/lib/receipt-extractors";
import { processReceipt } from "@/lib/receipt-processing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/receipt-extractors", () => ({
  createReceiptExtractor: vi.fn(),
}));
vi.mock("@/lib/receipt-processing", () => ({ processReceipt: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const householdId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const uploadId = "30000000-0000-4000-8000-000000000001";

interface StoredReceipt {
  id: string;
  household_id: string;
  uploaded_by: string;
  upload_id: string;
  content_type: string;
  object_size: number;
  content_sha256: string;
  original_filename: string;
  status: string;
  extraction_retryable: boolean;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function requestFor(bytes: Uint8Array) {
  const body = new FormData();
  body.set("uploadId", uploadId);
  body.set(
    "file",
    new Blob([Uint8Array.from(bytes).buffer], { type: "image/png" }),
    "receipt.png",
  );
  const request = new Request("http://localhost/api/receipts", {
    method: "POST",
    body,
  });
  request.headers.set("content-length", String(bytes.length + 1024));
  return request;
}

function createHarness(
  options: { concurrent?: boolean; firstInsertTransient?: boolean } = {},
) {
  let objectExists = false;
  let objectBytes: Uint8Array | null = null;
  const receipts: StoredReceipt[] = [];
  let uploadCalls = 0;
  const uploadsReady = deferred();
  let insertCalls = 0;
  const insertsReady = deferred();
  const remove = vi.fn();

  const query = (table: string) => {
    const filters: Record<string, unknown> = {};
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((field: string, value: unknown) => {
        filters[field] = value;
        return builder;
      }),
      order: vi.fn(async () => ({
        data:
          table === "household_members"
            ? [{
                household_id: householdId,
                user_id: userId,
                role: "owner",
                joined_at: "2026-01-01T00:00:00Z",
                households: { id: householdId, name: "Home" },
              }]
            : [],
        error: null,
      })),
      maybeSingle: vi.fn(async () => ({
        data:
          receipts.find((receipt) =>
            Object.entries(filters).every(
              ([field, value]) =>
                receipt[field as keyof StoredReceipt] === value,
            ),
          ) ?? null,
        error: null,
      })),
    };
    return builder;
  };

  const storageBucket = {
    upload: vi.fn(async (_path: string, bytes: Uint8Array) => {
      uploadCalls += 1;
      if (options.concurrent) {
        if (uploadCalls === 2) uploadsReady.resolve();
        await uploadsReady.promise;
      }
      if (objectExists) return { error: { message: "duplicate" } };
      objectExists = true;
      objectBytes = bytes;
      return { error: null };
    }),
    download: vi.fn(async () => ({
      data: objectBytes
        ? new Blob([Uint8Array.from(objectBytes).buffer])
        : null,
      error: objectBytes ? null : { message: "missing" },
    })),
  };
  const supabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } } })) },
    from: vi.fn(query),
    storage: { from: vi.fn(() => storageBucket) },
    rpc: vi.fn(async (name: string) =>
      name === "owns_receipt_object"
        ? { data: objectExists, error: null }
        : { data: null, error: null },
    ),
  };
  const admin = {
    from: vi.fn(() => ({
      insert: vi.fn(async (receipt: StoredReceipt) => {
        insertCalls += 1;
        const callNumber = insertCalls;
        if (options.concurrent) {
          if (insertCalls === 2) insertsReady.resolve();
          await insertsReady.promise;
        }
        if (options.firstInsertTransient && callNumber === 1) {
          return { error: { code: "XX000" } };
        }
        if (receipts.length) return { error: { code: "23505" } };
        receipts.push({ ...receipt, extraction_retryable: false });
        return { error: null };
      }),
    })),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ remove })) },
  };
  return {
    admin,
    remove,
    receipts,
    storageBucket,
    supabase,
    objectExists: () => objectExists,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cookies).mockResolvedValue({
    get: () => ({ value: householdId }),
  } as never);
  vi.mocked(createReceiptExtractor).mockReturnValue({ extract: vi.fn() });
  vi.mocked(processReceipt).mockResolvedValue({ status: "review_ready" });
});

describe("POST /api/receipts", () => {
  it("preserves the winning receipt object during concurrent idempotent uploads", async () => {
    const harness = createHarness({ concurrent: true });
    vi.mocked(createClient).mockResolvedValue(harness.supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(harness.admin as never);
    const png = new Uint8Array(
      await sharp({
        create: { width: 1, height: 1, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer(),
    );

    const [first, second] = await Promise.all([
      POST(await requestFor(png)),
      POST(await requestFor(png)),
    ]);
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(firstBody.receiptId).toBe(secondBody.receiptId);
    expect(harness.receipts).toHaveLength(1);
    expect(harness.objectExists()).toBe(true);
    expect(harness.remove).not.toHaveBeenCalled();
  });

  it("does not remove an object when one concurrent insert fails transiently", async () => {
    const harness = createHarness({
      concurrent: true,
      firstInsertTransient: true,
    });
    vi.mocked(createClient).mockResolvedValue(harness.supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(harness.admin as never);
    const png = new Uint8Array(
      await sharp({
        create: { width: 1, height: 1, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer(),
    );

    const responses = await Promise.all([
      POST(await requestFor(png)),
      POST(await requestFor(png)),
    ]);
    expect(responses.some((response) => response.ok)).toBe(true);
    expect(harness.receipts).toHaveLength(1);
    expect(harness.objectExists()).toBe(true);
    expect(harness.remove).not.toHaveBeenCalled();
  });

  it("retains and reuses an object after a transient insert failure", async () => {
    const harness = createHarness({ firstInsertTransient: true });
    vi.mocked(createClient).mockResolvedValue(harness.supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(harness.admin as never);
    const png = new Uint8Array(
      await sharp({
        create: { width: 1, height: 1, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer(),
    );

    const failed = await POST(await requestFor(png));
    expect(failed.status).toBe(500);
    expect(harness.objectExists()).toBe(true);

    const recovered = await POST(await requestFor(png));
    expect(recovered.ok).toBe(true);
    expect(harness.receipts).toHaveLength(1);
    expect(harness.storageBucket.download).toHaveBeenCalled();
    expect(harness.remove).not.toHaveBeenCalled();
  });

  it("routes repeated processing uploads through the guarded lease claim", async () => {
    const harness = createHarness();
    vi.mocked(createClient).mockResolvedValue(harness.supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(harness.admin as never);
    vi.mocked(processReceipt).mockResolvedValueOnce({ status: "processing" });
    const png = new Uint8Array(
      await sharp({
        create: { width: 1, height: 1, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer(),
    );
    harness.receipts.push({
      id: "50000000-0000-4000-8000-000000000001",
      household_id: householdId,
      uploaded_by: userId,
      upload_id: uploadId,
      content_type: "image/png",
      object_size: png.byteLength,
      content_sha256: createHash("sha256").update(png).digest("hex"),
      original_filename: "receipt.png",
      status: "processing",
      extraction_retryable: false,
    });

    const response = await POST(await requestFor(png));
    expect(response.status).toBe(200);
    expect(processReceipt).toHaveBeenCalledOnce();
    expect(harness.storageBucket.upload).not.toHaveBeenCalled();
  });
});
