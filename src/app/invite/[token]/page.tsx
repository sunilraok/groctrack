import { requireUser } from "@/lib/auth";
import { InviteForm } from "./invite-form";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  await requireUser(`/invite/${encodeURIComponent(token)}`);

  return (
    <main className="auth-page single-column">
      <section className="card modal-card">
        <p className="eyebrow">Household invitation</p>
        <h1>Join this household?</h1>
        <p>
          The invitation is accepted only if it is valid, unexpired, and tied
          to your confirmed email address.
        </p>
        <InviteForm token={token} />
      </section>
    </main>
  );
}
