import Decimal from "decimal.js";

export function reconcileReceipt(input: {
  subtotal: string | null;
  discount: string | null;
  tax: string | null;
  total: string | null;
  lineTotals: Array<string | null>;
}): string[] {
  const warnings: string[] = [];
  const parsedLines = input.lineTotals
    .filter((value): value is string => value !== null)
    .map((value) => new Decimal(value));

  if (input.subtotal && parsedLines.length > 0) {
    const lineSum = Decimal.sum(...parsedLines);
    if (!lineSum.minus(input.subtotal).abs().lte("0.02")) {
      warnings.push("Line items do not reconcile with the subtotal.");
    }
  }

  if (input.subtotal && input.total) {
    const expected = new Decimal(input.subtotal)
      .minus(input.discount ?? 0)
      .plus(input.tax ?? 0);
    if (!expected.minus(input.total).abs().lte("0.02")) {
      warnings.push("Subtotal, discounts, and tax do not reconcile with total.");
    }
  }

  return warnings;
}
