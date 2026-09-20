"use client";

import { useRouter } from "next/navigation";
import {
  ReceiptUploadFormView,
  RetryExtractionButtonView,
} from "@/components/form-views";

export function ReceiptUploadForm() {
  const router = useRouter();
  return (
    <ReceiptUploadFormView
      onRefresh={() => router.refresh()}
      upload={async (formData) => {
      const response = await fetch("/api/receipts", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as { error?: string; status?: string };
        return { ...result, ok: response.ok };
      }}
    />
  );
}

export function RetryExtractionButton({
  receiptId,
  processing = false,
}: {
  receiptId: string;
  processing?: boolean;
}) {
  const router = useRouter();
  return (
    <RetryExtractionButtonView
      onRefresh={() => router.refresh()}
      processing={processing}
      retry={async () => {
        const response = await fetch(`/api/receipts/${receiptId}/extract`, {
          method: "POST",
        });
        return response.ok;
      }}
    />
  );
}
