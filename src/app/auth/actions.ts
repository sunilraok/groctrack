"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: error.message };
  }
  redirect("/dashboard");
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

  const supabase = await createClient();
  const env = getServerEnv();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }
  return { message: "Check your email to confirm your account." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
