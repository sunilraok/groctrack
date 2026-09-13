import { createHash } from "node:crypto";
import { PDFDocument, ParseSpeeds } from "pdf-lib";
import sharp from "sharp";

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export const receiptFileTypes = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
} as const;

export type ReceiptContentType = keyof typeof receiptFileTypes;

export interface ValidatedReceiptFile {
  bytes: Uint8Array;
  contentType: ReceiptContentType;
  extension: string;
  originalFilename: string;
  sha256: string;
}

export class ReceiptFileError extends Error {}

const MAX_IMAGE_PIXELS = 25_000_000;
const MAX_IMAGE_EDGE = 12_000;
const MAX_PDF_PAGES = 50;

function isPngStructurallyBounded(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((value, index) => bytes[index] === value)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let chunkIndex = 0;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    const type = new TextDecoder("ascii").decode(bytes.slice(offset + 4, offset + 8));
    if (chunkIndex === 0 && (type !== "IHDR" || length !== 13)) return false;
    if (type === "IEND") return length === 0 && end === bytes.length;
    offset = end;
    chunkIndex += 1;
  }
  return false;
}

function isWebpStructurallyBounded(bytes: Uint8Array) {
  if (bytes.length < 20) return false;
  const decoder = new TextDecoder("ascii");
  if (
    decoder.decode(bytes.slice(0, 4)) !== "RIFF" ||
    decoder.decode(bytes.slice(8, 12)) !== "WEBP"
  ) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) return false;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset + 4, true);
    offset += 8 + length + (length % 2);
  }
  return offset === bytes.length;
}

function isJpegStructurallyBounded(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9) return offset === bytes.length;
    if (marker === 0x00 || marker === 0xd8) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return false;
    const scanDataStarts = marker === 0xda;
    offset += length;
    if (!scanDataStarts) continue;

    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const next = bytes[offset + 1];
      if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
        offset += 2;
        continue;
      }
      break;
    }
  }
  return false;
}

async function validateImageStructure(
  bytes: Uint8Array,
  contentType: Exclude<ReceiptContentType, "application/pdf">,
) {
  if (
    (contentType === "image/jpeg" && !isJpegStructurallyBounded(bytes)) ||
    (contentType === "image/png" && !isPngStructurallyBounded(bytes)) ||
    (contentType === "image/webp" && !isWebpStructurallyBounded(bytes))
  ) {
    throw new ReceiptFileError("The file contains malformed or trailing data.");
  }

  const image = sharp(bytes, {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
    sequentialRead: true,
  });
  const metadata = await image.metadata();
  if (
    metadata.format !== contentType.slice("image/".length) ||
    !metadata.width ||
    !metadata.height ||
    metadata.width > MAX_IMAGE_EDGE ||
    metadata.height > MAX_IMAGE_EDGE ||
    metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
    (metadata.pages ?? 1) !== 1
  ) {
    throw new ReceiptFileError("The image dimensions or format are unsupported.");
  }
  await image.stats();
}

async function validatePdfStructure(bytes: Uint8Array) {
  const source = new TextDecoder("latin1").decode(bytes);
  if (!source.startsWith("%PDF-") || !/%%EOF[ \t\r\n]*$/.test(source)) {
    throw new ReceiptFileError("The PDF contains malformed or trailing data.");
  }
  const document = await PDFDocument.load(bytes, {
    capNumbers: true,
    ignoreEncryption: false,
    parseSpeed: ParseSpeeds.Fast,
    throwOnInvalidObject: true,
    updateMetadata: false,
  });
  const pages = document.getPageCount();
  if (pages < 1 || pages > MAX_PDF_PAGES) {
    throw new ReceiptFileError(`PDF receipts must contain 1-${MAX_PDF_PAGES} pages.`);
  }
}

function safeFilename(name: string) {
  const filename = name.split(/[\\/]/).at(-1)?.normalize("NFKC") ?? "";
  if (
    filename.length < 1 ||
    filename.length > 255 ||
    /[\u0000-\u001f\u007f]/.test(filename)
  ) {
    throw new ReceiptFileError("Use a filename between 1 and 255 characters.");
  }
  return filename;
}

export async function validateReceiptFile(
  file: Pick<File, "name" | "size" | "type" | "arrayBuffer">,
): Promise<ValidatedReceiptFile> {
  if (file.size < 1 || file.size > MAX_RECEIPT_BYTES) {
    throw new ReceiptFileError("Receipt files must be between 1 byte and 10 MiB.");
  }

  const contentType = file.type.toLowerCase() as ReceiptContentType;
  const extensions = receiptFileTypes[contentType];
  if (!extensions) {
    throw new ReceiptFileError("Upload a JPEG, PNG, WebP, or PDF receipt.");
  }

  const originalFilename = safeFilename(file.name);
  const extension = originalFilename
    .slice(originalFilename.lastIndexOf("."))
    .toLowerCase();
  if (!extensions.includes(extension as never)) {
    throw new ReceiptFileError("The file extension does not match its media type.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size) {
    throw new ReceiptFileError("The file contents do not match its media type.");
  }
  try {
    if (contentType === "application/pdf") {
      await validatePdfStructure(bytes);
    } else {
      await validateImageStructure(bytes, contentType);
    }
  } catch (error) {
    if (error instanceof ReceiptFileError) throw error;
    throw new ReceiptFileError("The file contents are malformed or unsupported.");
  }

  return {
    bytes,
    contentType,
    extension,
    originalFilename,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
