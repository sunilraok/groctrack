import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const receiptId = "50000000-0000-4000-8000-000000000001";

function client(options: { authorized: boolean }) {
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://storage.example.test/signed" },
    error: null,
  }));
  const single = vi.fn(async () =>
    options.authorized
      ? { data: { image_path: "household/user/receipt.jpg" }, error: null }
      : { data: null, error: { code: "PGRST116" } },
  );
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "10000000-0000-4000-8000-000000000001" } },
      })),
    },
    from: vi.fn(() => ({ select })),
    storage: { from: vi.fn(() => ({ createSignedUrl })) },
    createSignedUrl,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/receipts/:id/image", () => {
  it("authorizes at request time and signs for exactly 60 seconds", async () => {
    const supabase = client({ authorized: true });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: receiptId }),
    });
    expect(response.status).toBe(302);
    expect(supabase.createSignedUrl).toHaveBeenCalledWith(
      "household/user/receipt.jpg",
      60,
    );
  });

  it("does not sign after household authorization is revoked", async () => {
    const supabase = client({ authorized: false });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: receiptId }),
    });
    expect(response.status).toBe(404);
    expect(supabase.createSignedUrl).not.toHaveBeenCalled();
  });
});
