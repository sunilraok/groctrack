import { beforeEach, describe, expect, it, vi } from "vitest";
import { genericSignInError, genericSignUpMessage } from "@/lib/public-auth";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  getServerEnv: vi.fn(() => ({
    NEXT_PUBLIC_SITE_URL: "https://groctrack.example",
  })),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { signIn, signUp } from "./actions";

function credentials(overrides: Record<string, string> = {}) {
  const form = new FormData();
  Object.entries({
    email: "USER@example.com",
    password: "password123",
    next: "/dashboard?view=home",
    ...overrides,
  }).forEach(([key, value]) => {
    form.set(key, value);
  });
  return form;
}

describe("auth server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns one generic error for provider sign-in errors", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          error: { message: "provider detail" },
        }),
      },
    });

    await expect(signIn({}, credentials())).resolves.toEqual({
      error: genericSignInError,
    });
  });

  it("returns the same generic error when the sign-in provider throws", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockRejectedValue(
          new Error("network detail"),
        ),
      },
    });

    await expect(signIn({}, credentials())).resolves.toEqual({
      error: genericSignInError,
    });
  });

  it("normalizes email and redirects only after successful sign-in", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ auth: { signInWithPassword } });

    await expect(signIn({}, credentials())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard?view=home",
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    });
  });

  it("rejects invalid credentials before calling Supabase", async () => {
    await expect(
      signIn({}, credentials({ email: "invalid", password: "short" })),
    ).resolves.toEqual({
      error: "Enter a valid email and a password of at least 8 characters.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each([
    [{ error: null }],
    [{ error: { message: "User already registered" } }],
  ])("returns the generic sign-up response for provider outcome %#", async (result) => {
    const signUpProvider = vi.fn().mockResolvedValue(result);
    mocks.createClient.mockResolvedValue({ auth: { signUp: signUpProvider } });
    const form = credentials({ displayName: "User" });

    await expect(signUp({}, form)).resolves.toEqual({
      message: genericSignUpMessage,
    });
    expect(signUpProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        options: expect.objectContaining({
          data: { display_name: "User" },
          emailRedirectTo:
            "https://groctrack.example/auth/callback?next=%2Fdashboard%3Fview%3Dhome",
        }),
      }),
    );
  });

  it("returns the same generic sign-up response when the provider throws", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        signUp: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      },
    });

    await expect(
      signUp({}, credentials({ displayName: "User" })),
    ).resolves.toEqual({ message: genericSignUpMessage });
  });
});
