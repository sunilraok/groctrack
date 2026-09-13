import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverEnvSchema = publicEnvSchema.extend({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  RECEIPT_EXTRACTOR: z.enum(["fake", "gemini"]).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_RECEIPT_MODEL: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,100}$/)
    .default("gemini-2.5-flash-lite"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
type Environment = Readonly<Record<string, string | undefined>>;

export function getPublicEnv(
  env: Environment = process.env,
): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function getServerEnv(
  env: Environment = process.env,
): ServerEnv {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: env.NEXT_PUBLIC_SITE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    RECEIPT_EXTRACTOR: env.RECEIPT_EXTRACTOR,
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    GEMINI_RECEIPT_MODEL: env.GEMINI_RECEIPT_MODEL,
  });
}
