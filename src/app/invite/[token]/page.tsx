import { requireUser } from "@/lib/auth";
import { InvitationScreen } from "@/components/screens";
import { InviteForm } from "./invite-form";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  await requireUser(`/invite/${encodeURIComponent(token)}`);

  return <InvitationScreen form={<InviteForm token={token} />} />;
}
