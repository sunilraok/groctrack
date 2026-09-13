import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const SIGNED_URL_TTL_SECONDS = 60;

export async function GET(
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

  const { data: receipt, error } = await supabase
    .from("receipts")
    .select("image_path")
    .eq("id", parsed.data)
    .single();
  if (error || !receipt) {
    return NextResponse.json({ error: "Receipt not found." }, { status: 404 });
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from("receipts")
    .createSignedUrl(receipt.image_path, SIGNED_URL_TTL_SECONDS);
  if (signedUrlError || !data) {
    return NextResponse.json({ error: "Unable to open receipt." }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl, 302);
}
