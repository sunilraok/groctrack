"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/navigation";
import {
  genericSignInError,
  submitSignUpWithoutEnumeration,
} from "@/lib/public-auth";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  next: z.string().optional(),
});

export type AuthState = { error?: string; message?: string };

export async function signIn(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Enter a valid email and a password of at least 8 characters." };
  }

  const supabase = await createClient();
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
    });
    if (error) return { error: genericSignInError };
  } catch {
    return { error: genericSignInError };
  }

  redirect(safeNextPath(parsed.data.next ?? null));
}

export async function signUp(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema
    .extend({ displayName: z.string().trim().min(1).max(80) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Enter your name, a valid email, and an 8+ character password." };
  }

  const next = safeNextPath(parsed.data.next ?? null);
  const supabase = await createClient();
  const env = getServerEnv();
  const callbackUrl = new URL("/auth/callback", env.NEXT_PUBLIC_SITE_URL);
  callbackUrl.searchParams.set("next", next);
  return submitSignUpWithoutEnumeration(() =>
    supabase.auth.signUp({
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      options: {
        data: { display_name: parsed.data.displayName },
        emailRedirectTo: callbackUrl.toString(),
      },
    }),
  );
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Unable to sign out: ${error.message}`);
  redirect("/");
}
