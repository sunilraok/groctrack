import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, request.url));
    } catch {
      // Confirmation failures use one public response without provider details.
    }
  }

  const errorUrl = new URL("/auth", request.url);
  errorUrl.searchParams.set("error", "confirmation");
  errorUrl.searchParams.set("next", next);
  return NextResponse.redirect(errorUrl);
}
