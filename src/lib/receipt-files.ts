import { createHash } from "node:crypto";

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

function hasPrefix(bytes: Uint8Array, prefix: number[]) {
  return prefix.every((value, index) => bytes[index] === value);
}

function matchesMagic(bytes: Uint8Array, contentType: ReceiptContentType) {
  switch (contentType) {
    case "image/jpeg":
      return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return (
        hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
      );
    case "application/pdf":
      return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
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
  if (bytes.byteLength !== file.size || !matchesMagic(bytes, contentType)) {
    throw new ReceiptFileError("The file contents do not match its media type.");
  }

  return {
    bytes,
    contentType,
    extension,
    originalFilename,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
