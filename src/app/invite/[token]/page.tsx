import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("accept_household_invitation", {
    invitation_token: token,
  });
  if (error) {
    return (
      <main className="auth-page">
        <section className="card modal-card">
          <p className="eyebrow">Invitation problem</p>
          <h1>Could not join household</h1>
          <p>{error.message}</p>
        </section>
      </main>
    );
  }
  redirect("/dashboard");
}
