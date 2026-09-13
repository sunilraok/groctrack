import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser(nextPath = "/dashboard") {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(`/auth?next=${encodeURIComponent(nextPath)}`);
  }

  return { supabase, user };
}
