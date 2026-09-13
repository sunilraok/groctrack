import { describe, expect, it } from "vitest";
import { getPublicEnv, getServerEnv } from "./env";

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
};

describe("environment validation", () => {
  it("accepts the required public Supabase settings", () => {
    expect(getPublicEnv(validEnv)).toEqual(validEnv);
  });

  it("rejects a missing public key", () => {
    expect(() =>
      getPublicEnv({ NEXT_PUBLIC_SUPABASE_URL: validEnv.NEXT_PUBLIC_SUPABASE_URL }),
    ).toThrow();
  });

  it("keeps service credentials server-only", () => {
    const env = getServerEnv({
      ...validEnv,
      SUPABASE_SERVICE_ROLE_KEY: "server-secret",
    });

    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("server-secret");
    expect(getPublicEnv(validEnv)).not.toHaveProperty(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
  });
});
