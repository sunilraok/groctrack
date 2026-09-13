import { describe, expect, it, vi } from "vitest";
import {
  genericSignUpMessage,
  submitSignUpWithoutEnumeration,
} from "./public-auth";

describe("public sign-up responses", () => {
  it("returns the generic response when the provider accepts a new address", async () => {
    const result = await submitSignUpWithoutEnumeration(
      vi.fn().mockResolvedValue({ error: null }),
    );

    expect(result).toEqual({ message: genericSignUpMessage });
  });

  it("returns the same response when the provider rejects a registered address", async () => {
    const result = await submitSignUpWithoutEnumeration(
      vi.fn().mockResolvedValue({
        error: { message: "User already registered" },
      }),
    );

    expect(result).toEqual({ message: genericSignUpMessage });
  });

  it("does not expose provider failures", async () => {
    const result = await submitSignUpWithoutEnumeration(
      vi.fn().mockRejectedValue(new Error("provider diagnostic")),
    );

    expect(result).toEqual({ message: genericSignUpMessage });
  });
});
