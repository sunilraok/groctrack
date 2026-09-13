import Link from "next/link";
import { safeNextPath } from "@/lib/navigation";
import { AuthForm } from "./auth-form";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next ?? null);

  return (
    <main className="auth-page">
      <Link className="brand" href="/">GrocTrack</Link>
      <section className="auth-copy">
        <p className="eyebrow">Your household, together</p>
        <h1>Share one private grocery workspace.</h1>
        <p>Create a household or join one through an invitation sent to your email.</p>
        {params.error === "confirmation" && (
          <p className="form-error" role="alert">
            The confirmation link is invalid or expired. Request a new sign-up link.
          </p>
        )}
      </section>
      <AuthForm next={next} />
    </main>
  );
}
