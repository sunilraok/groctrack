import { describe, expect, it } from "vitest";
import {
  MAX_RECEIPT_BYTES,
  ReceiptFileError,
  validateReceiptFile,
} from "@/lib/receipt-files";

function testFile(name: string, type: string, bytes: number[]) {
  const value = new Uint8Array(bytes);
  return {
    name,
    type,
    size: value.byteLength,
    arrayBuffer: async () => value.buffer,
  };
}

describe("validateReceiptFile", () => {
  it("accepts matching JPEG evidence", async () => {
    const result = await validateReceiptFile(
      testFile("receipt.jpg", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]),
    );
    expect(result.contentType).toBe("image/jpeg");
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects MIME and magic-byte spoofing", async () => {
    await expect(
      validateReceiptFile(
        testFile("receipt.png", "image/png", [0xff, 0xd8, 0xff, 0xe0]),
      ),
    ).rejects.toThrow("contents do not match");
  });

  it("rejects extension spoofing", async () => {
    await expect(
      validateReceiptFile(
        testFile("receipt.pdf", "image/jpeg", [0xff, 0xd8, 0xff, 0xe0]),
      ),
    ).rejects.toThrow("extension does not match");
  });

  it("rejects payloads above 10 MiB before reading bytes", async () => {
    let read = false;
    await expect(
      validateReceiptFile({
        name: "receipt.pdf",
        type: "application/pdf",
        size: MAX_RECEIPT_BYTES + 1,
        arrayBuffer: async () => {
          read = true;
          return new ArrayBuffer(0);
        },
      }),
    ).rejects.toBeInstanceOf(ReceiptFileError);
    expect(read).toBe(false);
  });
});
