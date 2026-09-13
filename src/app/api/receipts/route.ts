import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { selectHousehold } from "@/lib/household-access";
import { householdCookie } from "@/lib/households";
import {
  MAX_RECEIPT_BYTES,
  ReceiptFileError,
  validateReceiptFile,
} from "@/lib/receipt-files";
import { createReceiptExtractor } from "@/lib/receipt-extractors";
import { processReceipt } from "@/lib/receipt-processing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { HouseholdMembership } from "@/types/database";

const uploadSchema = z.object({ uploadId: z.string().uuid() });
const MAX_MULTIPART_BYTES = MAX_RECEIPT_BYTES + 64 * 1024;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    !request.headers.get("content-type")?.startsWith("multipart/form-data;") ||
    !Number.isFinite(declaredLength) ||
    declaredLength < 1
  ) {
    return NextResponse.json({ error: "Invalid receipt upload." }, { status: 400 });
  }
  if (declaredLength > MAX_MULTIPART_BYTES) {
    return NextResponse.json({ error: "Receipt file exceeds 10 MiB." }, { status: 413 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id, user_id, role, joined_at, households(*)")
    .eq("user_id", user.id)
    .order("joined_at");
  if (membershipError) {
    return NextResponse.json({ error: "Unable to authorize household." }, { status: 500 });
  }
  const current = selectHousehold(
    (membershipRows ?? []) as unknown as HouseholdMembership[],
    (await cookies()).get(householdCookie)?.value,
  );
  if (!current) {
    return NextResponse.json({ error: "Create a household before uploading." }, { status: 409 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid receipt upload." }, { status: 400 });
  }
  const parsed = uploadSchema.safeParse({ uploadId: formData.get("uploadId") });
  const file = formData.get("file");
  if (!parsed.success || !(file instanceof File)) {
    return NextResponse.json({ error: "Choose a receipt file." }, { status: 400 });
  }

  let validated;
  try {
    validated = await validateReceiptFile(file);
  } catch (error) {
    const message =
      error instanceof ReceiptFileError ? error.message : "Unable to validate receipt.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("receipts")
    .select(
      "id, content_type, object_size, content_sha256, original_filename, status, extraction_retryable",
    )
    .eq("household_id", current.household_id)
    .eq("uploaded_by", user.id)
    .eq("upload_id", parsed.data.uploadId)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: "Unable to inspect receipt upload." }, { status: 500 });
  }
  if (existing) {
    const sameUpload =
      existing.content_type === validated.contentType &&
      existing.object_size === file.size &&
      existing.content_sha256 === validated.sha256 &&
      existing.original_filename === validated.originalFilename;
    if (!sameUpload) {
      return NextResponse.json(
        { error: "This upload ID was already used for a different receipt." },
        { status: 409 },
      );
    }
    if (
      existing.status === "pending" ||
      (existing.status === "failed" && existing.extraction_retryable)
    ) {
      try {
        const extraction = await processReceipt({
          admin: createAdminClient(),
          authorizedClient: supabase,
          extractor: createReceiptExtractor(),
          receiptId: existing.id,
        });
        return NextResponse.json({ receiptId: existing.id, ...extraction });
      } catch {
        return NextResponse.json(
          { error: "Receipt extraction is not configured." },
          { status: 503 },
        );
      }
    }
    return NextResponse.json({ receiptId: existing.id, status: existing.status });
  }

  let admin;
  let extractor;
  try {
    admin = createAdminClient();
    extractor = createReceiptExtractor();
  } catch {
    return NextResponse.json(
      { error: "Receipt extraction is not configured." },
      { status: 503 },
    );
  }

  const objectPath = [
    current.household_id,
    user.id,
    `${parsed.data.uploadId}${validated.extension}`,
  ].join("/");
  const { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(objectPath, validated.bytes, {
      contentType: validated.contentType,
      upsert: false,
    });
  if (uploadError) {
    const { data: ownedExistingObject } = await supabase.rpc(
      "owns_receipt_object",
      { object_name: objectPath },
    );
    const { data: existingObject } = ownedExistingObject
      ? await supabase.storage.from("receipts").download(objectPath)
      : { data: null };
    const existingBytes = existingObject
      ? new Uint8Array(await existingObject.arrayBuffer())
      : null;
    const existingHash = existingBytes
      ? createHash("sha256").update(existingBytes).digest("hex")
      : null;
    if (
      !existingBytes ||
      existingBytes.byteLength !== file.size ||
      existingHash !== validated.sha256
    ) {
      return NextResponse.json(
        { error: "This upload ID is already in use." },
        { status: 409 },
      );
    }
  }

  const { data: ownsObject, error: ownershipError } = await supabase.rpc(
    "owns_receipt_object",
    { object_name: objectPath },
  );
  if (ownershipError || !ownsObject) {
    await admin.storage.from("receipts").remove([objectPath]);
    return NextResponse.json({ error: "Unable to verify receipt ownership." }, { status: 500 });
  }

  const receiptId = randomUUID();
  const { error: insertError } = await admin.from("receipts").insert({
    id: receiptId,
    household_id: current.household_id,
    uploaded_by: user.id,
    upload_id: parsed.data.uploadId,
    image_path: objectPath,
    original_filename: validated.originalFilename,
    content_type: validated.contentType,
    object_size: file.size,
    content_sha256: validated.sha256,
    status: "pending",
  });
  if (insertError) {
    await admin.storage.from("receipts").remove([objectPath]);
    return NextResponse.json({ error: "Unable to register receipt." }, { status: 500 });
  }

  const extraction = await processReceipt({
    admin,
    authorizedClient: supabase,
    extractor,
    receiptId,
  });
  return NextResponse.json({ receiptId, ...extraction }, { status: 201 });
}
