import { describe, expect, it } from "vitest";
import { FakeReceiptExtractor } from "@/lib/receipt-extractors/fake";

describe("FakeReceiptExtractor", () => {
  it("returns deterministic evidence for local and test runs", async () => {
    const extractor = new FakeReceiptExtractor();
    const input = {
      bytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "application/pdf" as const,
    };
    expect(await extractor.extract(input)).toEqual(await extractor.extract(input));
  });
});
