import { describe, expect, it } from "vitest";
import { safeNextPath } from "./navigation";

describe("safeNextPath", () => {
  it("keeps internal paths and query strings", () => {
    expect(safeNextPath("/invite/token?source=email")).toBe(
      "/invite/token?source=email",
    );
  });

  it.each([
    ["https://attacker.example"],
    ["//attacker.example/path"],
    ["dashboard"],
    [null],
  ])("rejects an unsafe redirect target", (target) => {
    expect(safeNextPath(target)).toBe("/dashboard");
  });
});
