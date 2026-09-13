import { NextResponse } from "next/server";
import { z } from "zod";
import { createReceiptExtractor } from "@/lib/receipt-extractors";
import {
  processReceipt,
  ReceiptNotFoundError,
} from "@/lib/receipt-processing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const parsed = idSchema.safeParse((await context.params).id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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

  try {
    const result = await processReceipt({
      admin,
      authorizedClient: supabase,
      extractor,
      receiptId: parsed.data,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReceiptNotFoundError) {
      return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Unable to process receipt." },
      { status: 500 },
    );
  }
}
