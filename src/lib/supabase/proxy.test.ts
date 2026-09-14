import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  cookieRefresh: false,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));
vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  }),
}));

import { updateSession } from "./proxy";
import { config, proxy } from "@/proxy";

describe("session refresh proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieRefresh = false;
    mocks.createServerClient.mockImplementation(
      (_url: string, _key: string, options: {
        cookies: {
          setAll: (
            values: Array<{
              name: string;
              value: string;
              options: { httpOnly: boolean };
            }>,
          ) => void;
        };
      }) => ({
        auth: {
          getUser: async () => {
            if (mocks.cookieRefresh) {
              options.cookies.setAll([
                {
                  name: "sb-session",
                  value: "refreshed",
                  options: { httpOnly: true },
                },
              ]);
            }
            return mocks.getUser();
          },
        },
      }),
    );
  });

  it("redirects an unauthenticated dashboard request and preserves its query", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await proxy(
      new NextRequest("https://groctrack.example/dashboard?view=low-stock"),
    );
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/auth");
    expect(location.searchParams.get("next")).toBe(
      "/dashboard?view=low-stock",
    );
  });

  it("passes authenticated dashboard requests through", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-id" } } });
    const response = await updateSession(
      new NextRequest("https://groctrack.example/dashboard/settings"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("propagates refreshed cookies to the response", async () => {
    mocks.cookieRefresh = true;
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-id" } } });
    const response = await updateSession(
      new NextRequest("https://groctrack.example/dashboard"),
    );

    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
  });

  it("leaves public paths available to unauthenticated users", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await updateSession(
      new NextRequest("https://groctrack.example/invite/token"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    ["/dashboard", true],
    ["/auth", true],
    ["/invite/token", true],
    ["/_next/static/chunk.js", false],
    ["/_next/image", false],
    ["/favicon.ico", false],
    ["/logo.svg", false],
  ])("matcher handles %s", (pathname, expected) => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    expect(matcher.test(pathname)).toBe(expected);
  });
});
