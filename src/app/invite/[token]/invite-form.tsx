"use client";

import { useActionState } from "react";
import { acceptInvitation } from "@/app/dashboard/actions";
import { InviteFormView } from "@/components/form-views";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitation, null);
  return <InviteFormView action={action} pending={pending} state={state} token={token} />;
}
