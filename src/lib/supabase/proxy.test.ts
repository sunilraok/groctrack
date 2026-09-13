import { describe, expect, it } from "vitest";
import { isProtectedPath } from "./proxy";

describe("protected route matching", () => {
  it.each(["/dashboard", "/dashboard/settings", "/dashboard/onboarding"])(
    "protects %s",
    (pathname) => {
      expect(isProtectedPath(pathname)).toBe(true);
    },
  );

  it.each(["/", "/auth", "/invite/token", "/dashboard-preview"])(
    "leaves %s public",
    (pathname) => {
      expect(isProtectedPath(pathname)).toBe(false);
    },
  );
});
