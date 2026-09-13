type ReceiptEvent =
  | "claim_skipped"
  | "extraction_completed"
  | "completion_superseded"
  | "extraction_failed";

interface ReceiptEventContext {
  receiptId: string;
  provider?: string;
  errorKind?: string;
}

export function logReceiptEvent(
  event: ReceiptEvent,
  context: ReceiptEventContext,
) {
  const entry = JSON.stringify({ event, ...context });
  if (event === "extraction_failed") {
    console.warn(`[receipt] ${entry}`);
  } else {
    console.info(`[receipt] ${entry}`);
  }
}
