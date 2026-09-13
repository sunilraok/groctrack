import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverEnvSchema = publicEnvSchema.extend({
  GEMINI_API_KEY: z.string().optional(),
  RECEIPT_EXTRACTION_PROVIDER: z.enum(["gemini", "fake"]).default("fake"),
  GEMINI_RECEIPT_MODEL: z.string().default("gemini-2.5-flash-lite"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function getServerEnv() {
  const env = serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    RECEIPT_EXTRACTION_PROVIDER: process.env.RECEIPT_EXTRACTION_PROVIDER,
    GEMINI_RECEIPT_MODEL: process.env.GEMINI_RECEIPT_MODEL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (env.RECEIPT_EXTRACTION_PROVIDER === "gemini" && !env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required when using the Gemini extractor");
  }

  return env;
}
