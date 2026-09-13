import type { Receipt } from "@/types/database";
import { requireHousehold } from "@/lib/households";
import { ReceiptUploadForm, RetryExtractionButton } from "./receipt-upload-form";

const statusLabels: Record<Receipt["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  review_ready: "Ready for review",
  failed: "Extraction failed",
  posted: "Posted",
  voided: "Voided",
};

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
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{current.households.name}</p>
          <h1>Receipts</h1>
          <p>Private uploads are extracted for review without changing inventory.</p>
        </div>
      </header>
      <div className="receipt-grid">
        <section className="card panel">
          <div className="panel-heading"><h2>Upload a receipt</h2></div>
          <ReceiptUploadForm />
        </section>
        <section className="card panel">
          <div className="panel-heading">
            <h2>Recent receipts</h2>
            <span className="item-meta">{receipts.length} receipts</span>
          </div>
          {receipts.length === 0 ? (
            <div className="empty-state">
              <h3>No receipts yet</h3>
              <p>Use your camera or choose a supported file.</p>
            </div>
          ) : (
            <div className="receipt-list">
              {receipts.map((receipt) => (
                <article className="receipt-row" key={receipt.id}>
                  <div>
                    <a
                      className="item-name receipt-link"
                      href={`/api/receipts/${receipt.id}/image`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {receipt.original_filename}
                    </a>
                    <div className="item-meta">
                      {receipt.merchants?.name ?? "Merchant not identified"}
                      {" · "}
                      {new Date(receipt.created_at).toLocaleString()}
                    </div>
                    {receipt.extraction_error && (
                      <p className="form-error">{receipt.extraction_error}</p>
                    )}
                  </div>
                  <span className={`badge receipt-status ${receipt.status}`}>
                    {statusLabels[receipt.status]}
                  </span>
                  {receipt.status === "failed" && receipt.extraction_retryable && (
                    <RetryExtractionButton receiptId={receipt.id} />
                  )}
                  {receipt.status === "processing" && (
                    <RetryExtractionButton processing receiptId={receipt.id} />
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
