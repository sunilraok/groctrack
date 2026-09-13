import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ReceiptExtractionError,
  type ReceiptExtractionInput,
  type ReceiptExtractor,
} from "@/lib/receipt-extraction";
import { reconcileReceipt } from "@/lib/receipt-reconciliation";
import { logReceiptEvent } from "@/lib/receipt-observability";

interface ProcessReceiptOptions {
  admin: SupabaseClient;
  authorizedClient: SupabaseClient;
  extractor: ReceiptExtractor;
  receiptId: string;
}

export interface ProcessReceiptResult {
  status: "pending" | "processing" | "review_ready" | "failed" | "posted" | "voided";
  retryable?: boolean;
}

export class ReceiptNotFoundError extends Error {}

function safeFailure(error: unknown): ReceiptExtractionError {
  if (error instanceof ReceiptExtractionError) return error;
  return new ReceiptExtractionError(
    "transient",
    "Receipt extraction failed unexpectedly.",
    true,
  );
}

export async function processReceipt({
  admin,
  authorizedClient,
  extractor,
  receiptId,
}: ProcessReceiptOptions): Promise<ProcessReceiptResult> {
  const { data: receipt, error: lookupError } = await authorizedClient
    .from("receipts")
    .select("id, image_path, content_type, status")
    .eq("id", receiptId)
    .single();
  if (lookupError || !receipt) throw new ReceiptNotFoundError("Receipt not found.");

  const runId = randomUUID();
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_receipt_extraction",
    { target_receipt_id: receipt.id, new_run_id: runId },
  );
  if (claimError) throw new Error("Unable to claim receipt extraction.");
  if (!claimed) {
    logReceiptEvent("claim_skipped", { receiptId: receipt.id });
    return {
      status: receipt.status as ProcessReceiptResult["status"],
    };
  }

  try {
    const { data: object, error: downloadError } = await authorizedClient.storage
      .from("receipts")
      .download(receipt.image_path);
    if (downloadError || !object) {
      throw new ReceiptExtractionError(
        "permanent",
        "The private receipt file is unavailable.",
        false,
      );
    }

    const input: ReceiptExtractionInput = {
      bytes: new Uint8Array(await object.arrayBuffer()),
      contentType: receipt.content_type as ReceiptExtractionInput["contentType"],
    };
    const result = await extractor.extract(input);
    const reconciled = reconcileReceipt(result.receipt);
    const { data: completed, error: completionError } = await admin.rpc(
      "complete_receipt_extraction",
      {
        target_receipt_id: receipt.id,
        expected_run_id: runId,
        extraction_provider: result.provider,
        extraction_model: result.model,
        schema_version: result.schemaVersion,
        extracted_receipt: result.receipt,
        warnings: reconciled.warnings,
        lines: reconciled.lines,
      },
    );
    if (completionError) throw new Error("Unable to persist receipt extraction.");
    if (!completed) {
      const { data: current, error: currentError } = await authorizedClient
        .from("receipts")
        .select("status")
        .eq("id", receipt.id)
        .single();
      if (currentError || !current) {
        throw new Error("Unable to resolve superseded receipt extraction.");
      }
      logReceiptEvent("completion_superseded", { receiptId: receipt.id });
      return { status: current.status as ProcessReceiptResult["status"] };
    }
    logReceiptEvent("extraction_completed", {
      receiptId: receipt.id,
      provider: result.provider,
    });
    return { status: "review_ready" };
  } catch (error) {
    const failure = safeFailure(error);
    const { data: failed, error: failureError } = await admin.rpc("fail_receipt_extraction", {
      target_receipt_id: receipt.id,
      expected_run_id: runId,
      error_code: failure.kind,
      safe_error: failure.message,
      retryable: failure.retryable,
    });
    if (failureError) throw new Error("Unable to record receipt extraction failure.");
    if (!failed) {
      const { data: current, error: currentError } = await authorizedClient
        .from("receipts")
        .select("status")
        .eq("id", receipt.id)
        .single();
      if (currentError || !current) {
        throw new Error("Unable to resolve superseded receipt extraction.");
      }
      logReceiptEvent("completion_superseded", { receiptId: receipt.id });
      return { status: current.status as ProcessReceiptResult["status"] };
    }
    logReceiptEvent("extraction_failed", {
      receiptId: receipt.id,
      errorKind: failure.kind,
    });
    return { status: "failed", retryable: failure.retryable };
  }
}
