"use client";

import { useActionState } from "react";
import { acceptInvitation } from "@/app/dashboard/actions";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitation, null);
  return (
    <form action={action} className="stack">
      <input name="token" type="hidden" value={token} />
      {state && !state.ok && (
        <p className="form-error" role="alert">{state.error}</p>
      )}
      <button className="button primary" disabled={pending}>
        {pending ? "Joining..." : "Accept invitation"}
      </button>
    </form>
  );
}
