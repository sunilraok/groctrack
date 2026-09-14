import Decimal from "decimal.js";
import type { ExtractedReceipt } from "@/lib/receipt-extraction";

export type PersistedReceiptLine = ExtractedReceipt["lines"][number] & {
  line_number: number;
  is_ambiguous: boolean;
  validation_warnings: string[];
};

export interface ReconciledReceipt {
  receipt: Omit<ExtractedReceipt, "lines">;
  lines: PersistedReceiptLine[];
  warnings: string[];
}

function differs(left: Decimal, right: Decimal) {
  return left.minus(right).abs().greaterThan(new Decimal("0.01"));
}

export function reconcileReceipt(extracted: ExtractedReceipt): ReconciledReceipt {
  const warnings: string[] = [];
  if (!extracted.merchant_name) warnings.push("merchant_missing");
  if (!extracted.purchased_at) warnings.push("purchase_time_missing");
  if (!extracted.total) warnings.push("total_missing");
  if (extracted.lines.length === 0) warnings.push("line_items_missing");

  const lineTotals = extracted.lines
    .map((line) => line.line_total)
    .filter((value): value is string => value !== null);
  if (lineTotals.length === extracted.lines.length && lineTotals.length > 0) {
    const sum = lineTotals.reduce(
      (total, value) => total.plus(value),
      new Decimal(0),
    );
    const comparison = extracted.subtotal ?? extracted.total;
    if (comparison !== null && differs(sum, new Decimal(comparison))) {
      warnings.push("line_total_mismatch");
    }
  }

  if (extracted.subtotal !== null && extracted.total !== null) {
    const expected = new Decimal(extracted.subtotal)
      .minus(extracted.discount ?? 0)
      .plus(extracted.tax ?? 0);
    if (differs(expected, new Decimal(extracted.total))) {
      warnings.push("receipt_total_mismatch");
    }
  }

  const lines = extracted.lines.map((line, index) => {
    const lineWarnings: string[] = [];
    if (
      line.quantity === null &&
      line.weight === null &&
      line.unit_price === null &&
      line.line_total === null
    ) {
      lineWarnings.push("insufficient_line_detail");
    }
    if ((line.quantity === null) !== (line.unit === null)) {
      lineWarnings.push("quantity_unit_incomplete");
    }
    if ((line.weight === null) !== (line.weight_unit === null)) {
      lineWarnings.push("weight_unit_incomplete");
    }
    return {
      ...line,
      line_number: index + 1,
      is_ambiguous: lineWarnings.length > 0,
      validation_warnings: lineWarnings,
    };
  });

  const { lines: _lines, ...receipt } = extracted;
  return { receipt, lines, warnings };
}
