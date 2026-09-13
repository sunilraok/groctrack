export function normalizeReceiptAlias(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleUpperCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
