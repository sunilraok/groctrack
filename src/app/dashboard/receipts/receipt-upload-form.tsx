"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export function ReceiptUploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadIdRef = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size < 1) {
      setMessage("Choose a receipt image or PDF.");
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setMessage("Receipt files cannot exceed 10 MiB.");
      return;
    }

    setPending(true);
    setMessage(null);
    uploadIdRef.current ??= crypto.randomUUID();
    formData.set("uploadId", uploadIdRef.current);
    try {
      const response = await fetch("/api/receipts", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Receipt upload failed.");
        return;
      }
      setMessage(
        result.status === "review_ready"
          ? "Receipt uploaded and extracted."
          : "Receipt uploaded. Extraction needs attention.",
      );
      if (inputRef.current) inputRef.current.value = "";
      uploadIdRef.current = null;
      router.refresh();
    } catch {
      setMessage("Receipt upload could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={submit} className="receipt-upload">
      <label className="receipt-file-picker">
        <span>Receipt image or PDF</span>
        <input
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          disabled={pending}
          name="file"
          ref={inputRef}
          required
          type="file"
        />
        <small>JPEG, PNG, WebP, or PDF; maximum 10 MiB.</small>
      </label>
      {message && (
        <p className={message.includes("uploaded") ? "form-success" : "form-error"} role="status">
          {message}
        </p>
      )}
      <button className="button primary" disabled={pending}>
        {pending ? "Uploading and extracting..." : "Upload receipt"}
      </button>
    </form>
  );
}

export function RetryExtractionButton({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/receipts/${receiptId}/extract`, {
        method: "POST",
      });
      if (!response.ok) {
        setError("Unable to retry extraction.");
        return;
      }
      router.refresh();
    } catch {
      setError("Unable to retry extraction.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="receipt-retry">
      <button className="button ghost small" disabled={pending} onClick={retry} type="button">
        {pending ? "Retrying..." : "Retry extraction"}
      </button>
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
