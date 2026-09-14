import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET } from "./route";

describe("auth callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { exchangeCodeForSession: mocks.exchangeCodeForSession },
    });
  });

  it("exchanges the code and redirects to a safe next path", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      new NextRequest(
        "https://groctrack.example/auth/callback?code=abc&next=%2Finvite%2Ftoken",
      ),
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.headers.get("location")).toBe(
      "https://groctrack.example/invite/token",
    );
  });

  it("uses the dashboard for an unsafe next target", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      new NextRequest(
        "https://groctrack.example/auth/callback?code=abc&next=https%3A%2F%2Fevil.example",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://groctrack.example/dashboard",
    );
  });

  it.each([
    ["missing code", "https://groctrack.example/auth/callback"],
    [
      "exchange failure",
      "https://groctrack.example/auth/callback?code=bad&next=%2Finvite%2Ftoken",
    ],
  ])("redirects to a public confirmation error on %s", async (scenario, url) => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: scenario === "exchange failure" ? { message: "detail" } : null,
    });
    const response = await GET(new NextRequest(url));
    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/auth");
    expect(location.searchParams.get("error")).toBe("confirmation");
    expect(location.searchParams.get("next")).toBe(
      scenario === "exchange failure" ? "/invite/token" : "/dashboard",
    );
  });

  it("uses the same public error when the code exchange throws", async () => {
    mocks.exchangeCodeForSession.mockRejectedValue(
      new Error("provider unavailable"),
    );
    const response = await GET(
      new NextRequest(
        "https://groctrack.example/auth/callback?code=bad&next=%2Fdashboard",
      ),
    );
    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/auth");
    expect(location.searchParams.get("error")).toBe("confirmation");
    expect(location.searchParams.get("next")).toBe("/dashboard");
  });
});
