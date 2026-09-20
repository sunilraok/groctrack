import type { Receipt } from "@/types/database";
import { requireHousehold } from "@/lib/households";
import { ReceiptsScreen } from "@/components/screens";
import { ReceiptUploadForm, RetryExtractionButton } from "./receipt-upload-form";

export default async function ReceiptsPage() {
  const { supabase, current } = await requireHousehold();
  const { data, error } = await supabase
    .from("receipts")
    .select(
      "id, household_id, uploaded_by, upload_id, image_path, original_filename, content_type, object_size, status, merchant_id, purchased_at, currency, subtotal, discount, tax, total, extraction_warnings, extraction_error, extraction_error_code, extraction_retryable, created_at, merchants(name)",
    )
    .eq("household_id", current.household_id)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load receipts.");
  const receipts = (data ?? []) as unknown as Receipt[];

  return (
    <ReceiptsScreen
      householdName={current.households.name}
      receipts={receipts}
      retryFor={(receipt) => (
        <>
          {receipt.status === "failed" && receipt.extraction_retryable && (
            <RetryExtractionButton receiptId={receipt.id} />
          )}
          {receipt.status === "processing" && (
            <RetryExtractionButton processing receiptId={receipt.id} />
          )}
        </>
      )}
      uploadForm={<ReceiptUploadForm />}
    />
  );
}
