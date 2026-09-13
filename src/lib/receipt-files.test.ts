import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  MAX_RECEIPT_BYTES,
  ReceiptFileError,
  validateReceiptFile,
} from "@/lib/receipt-files";

function testFile(name: string, type: string, bytes: Uint8Array) {
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

async function image(format: "jpeg" | "png" | "webp", width = 1, height = 1) {
  return new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: "#ffffff",
      },
    })
      [format]()
      .toBuffer(),
  );
}

async function pdf(pageCount = 1) {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) document.addPage([10, 10]);
  return document.save({ useObjectStreams: false });
}

describe("validateReceiptFile", () => {
  it.each([
    ["receipt.jpg", "image/jpeg", "jpeg"],
    ["receipt.png", "image/png", "png"],
    ["receipt.webp", "image/webp", "webp"],
  ] as const)("structurally decodes %s", async (name, type, format) => {
    const result = await validateReceiptFile(
      testFile(name, type, await image(format)),
    );
    expect(result.contentType).toBe(type);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("parses a bounded PDF", async () => {
    const result = await validateReceiptFile(
      testFile("receipt.pdf", "application/pdf", await pdf()),
    );
    expect(result.contentType).toBe("application/pdf");
  });

  it("rejects MIME and decoded-format spoofing", async () => {
    await expect(
      validateReceiptFile(
        testFile("receipt.png", "image/png", await image("jpeg")),
      ),
    ).rejects.toThrow();
  });

  it("rejects extension spoofing", async () => {
    await expect(
      validateReceiptFile(
        testFile("receipt.pdf", "image/jpeg", await image("jpeg")),
      ),
    ).rejects.toThrow("extension does not match");
  });

  it("rejects truncated image and PDF structures", async () => {
    const jpeg = await image("jpeg");
    const validPdf = await pdf();
    await expect(
      validateReceiptFile(
        testFile("receipt.jpg", "image/jpeg", jpeg.slice(0, -2)),
      ),
    ).rejects.toThrow("malformed");
    await expect(
      validateReceiptFile(
        testFile("receipt.pdf", "application/pdf", validPdf.slice(0, -6)),
      ),
    ).rejects.toThrow("malformed");
  });

  it("rejects trailing polyglot payloads", async () => {
    const png = await image("png");
    const polyglot = new Uint8Array(png.length + 25);
    polyglot.set(png);
    polyglot.set(new TextEncoder().encode("<script>alert(1)</script>"), png.length);
    await expect(
      validateReceiptFile(testFile("receipt.png", "image/png", polyglot)),
    ).rejects.toThrow("trailing");
  });

  it("guards image dimensions and PDF page counts", async () => {
    await expect(
      validateReceiptFile(
        testFile("wide.png", "image/png", await image("png", 12_001, 1)),
      ),
    ).rejects.toThrow("dimensions");
    await expect(
      validateReceiptFile(
        testFile("long.pdf", "application/pdf", await pdf(51)),
      ),
    ).rejects.toThrow("1-50 pages");
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
