import { PDFDocument, PDFName, PDFString } from "pdf-lib";
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

async function activePdf() {
  const document = await PDFDocument.create();
  document.addPage([10, 10]);
  document.catalog.set(
    PDFName.of("OpenAction"),
    document.context.obj({
      S: PDFName.of("JavaScript"),
      JS: PDFString.of("app.alert(1)"),
    }),
  );
  return document.save({ useObjectStreams: false });
}

async function encryptedPdf() {
  const source = new TextDecoder("latin1").decode(await pdf());
  return new Uint8Array(
    Buffer.from(
      source.replace(/(trailer\s*<<)/, "$1\n/Encrypt 1 0 R"),
      "latin1",
    ),
  );
}

async function pdfWithBenignActiveContentText() {
  const document = await PDFDocument.create();
  const page = document.addPage([10, 10]);
  const stream = document.context.register(
    document.context.stream("% /JS and /OpenAction are benign text here\n"),
  );
  page.node.set(PDFName.Contents, stream);
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

    const jpeg = await image("jpeg");
    const jpegPolyglot = new Uint8Array(jpeg.length + 10);
    jpegPolyglot.set(jpeg);
    jpegPolyglot.set(
      new Uint8Array([0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x3e, 0xff, 0xd9]),
      jpeg.length,
    );
    await expect(
      validateReceiptFile(
        testFile("receipt.jpg", "image/jpeg", jpegPolyglot),
      ),
    ).rejects.toThrow("trailing");

    const validWebp = await image("webp");
    const webpPolyglot = new Uint8Array(validWebp.length + 8);
    webpPolyglot.set(validWebp);
    webpPolyglot.set(new TextEncoder().encode("trailing"), validWebp.length);
    await expect(
      validateReceiptFile(
        testFile("receipt.webp", "image/webp", webpPolyglot),
      ),
    ).rejects.toThrow("trailing");

    const validPdf = await pdf();
    const pdfPolyglot = new Uint8Array(validPdf.length + 8);
    pdfPolyglot.set(validPdf);
    pdfPolyglot.set(new TextEncoder().encode("<script>"), validPdf.length);
    await expect(
      validateReceiptFile(
        testFile("receipt.pdf", "application/pdf", pdfPolyglot),
      ),
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
        testFile(
          "too-many-pixels.png",
          "image/png",
          await image("png", 5_001, 5_000),
        ),
      ),
    ).rejects.toThrow();
    await expect(
      validateReceiptFile(
        testFile("long.pdf", "application/pdf", await pdf(51)),
      ),
    ).rejects.toThrow("1-50 pages");
  });

  it("rejects animated WebP receipts", async () => {
    const rawFrames = Buffer.from([
      255, 0, 0, 255,
      0, 0, 255, 255,
    ]);
    const gif = await sharp(rawFrames, {
      raw: { width: 1, height: 2, pageHeight: 1, channels: 4 },
    })
      .gif({ delay: [100, 100], loop: 0 })
      .toBuffer();
    const animated = new Uint8Array(
      await sharp(gif, { pages: -1 })
        .webp({ delay: [100, 100], loop: 0 })
        .toBuffer(),
    );
    await expect(
      validateReceiptFile(
        testFile("animated.webp", "image/webp", animated),
      ),
    ).rejects.toThrow("dimensions");
  });

  it.each([
    "../receipt.png",
    "folder/receipt.png",
    "folder\\receipt.png",
    "\u0000receipt.png",
    "",
    `${"é".repeat(128)}.png`,
  ])("rejects unsafe filename %j", async (name) => {
    await expect(
      validateReceiptFile(testFile(name, "image/png", await image("png"))),
    ).rejects.toBeInstanceOf(ReceiptFileError);
  });

  it("normalizes Unicode filenames before persistence", async () => {
    const result = await validateReceiptFile(
      testFile("re\u0301ceipt.png", "image/png", await image("png")),
    );
    expect(result.originalFilename).toBe("réceipt.png");
  });

  it("rejects zero bytes and declared-size mismatches", async () => {
    await expect(
      validateReceiptFile(testFile("empty.png", "image/png", new Uint8Array())),
    ).rejects.toThrow("between 1 byte and 10 MiB");

    const png = await image("png");
    await expect(
      validateReceiptFile({
        ...testFile("receipt.png", "image/png", png),
        size: png.length + 1,
      }),
    ).rejects.toThrow("do not match");
  });

  it("accepts a structurally valid PDF at exactly 10 MiB", async () => {
    const validPdf = await pdf();
    const exact = new Uint8Array(MAX_RECEIPT_BYTES);
    exact.fill(0x20);
    exact.set(validPdf);
    const eof = new TextEncoder().encode("%%EOF\n");
    exact.set(eof, exact.length - eof.length);
    await expect(
      validateReceiptFile(testFile("receipt.pdf", "application/pdf", exact)),
    ).resolves.toMatchObject({ contentType: "application/pdf" });
  });

  it("rejects encrypted or active-content PDFs by policy", async () => {
    await expect(
      validateReceiptFile(
        testFile("active.pdf", "application/pdf", await activePdf()),
      ),
    ).rejects.toThrow("active content");
    await expect(
      validateReceiptFile(
        testFile("encrypted.pdf", "application/pdf", await encryptedPdf()),
      ),
    ).rejects.toThrow("Encrypted PDFs");
  });

  it("accepts active-content names inside inert stream bytes", async () => {
    await expect(
      validateReceiptFile(
        testFile(
          "benign-text.pdf",
          "application/pdf",
          await pdfWithBenignActiveContentText(),
        ),
      ),
    ).resolves.toMatchObject({ contentType: "application/pdf" });
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
