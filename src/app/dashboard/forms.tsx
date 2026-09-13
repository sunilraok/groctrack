"use client";

import { useActionState } from "react";
import type { HouseholdMembership } from "@/types/database";
import {
  createHousehold,
  createInvitation,
  removeHouseholdMember,
  switchHousehold,
  type FormState,
} from "./actions";

export function Feedback({ state }: { state: FormState<unknown> }) {
  if (!state) return null;
  return state.ok ? (
    <p className="form-success">Saved.</p>
  ) : (
    <p className="form-error" role="alert">{state.error}</p>
  );
}

export function HouseholdForm() {
  const [state, action, pending] = useActionState(createHousehold, null);
  return (
    <form action={action} className="stack">
      <label>
        Household name
        <input name="name" placeholder="Rao household" maxLength={80} required />
      </label>
      <Feedback state={state} />
      <button className="button primary" disabled={pending}>
        {pending ? "Creating..." : "Create household"}
      </button>
    </form>
  );
}

export function HouseholdSwitcher({
  memberships,
  currentId,
}: {
  memberships: HouseholdMembership[];
  currentId: string;
}) {
  const [state, action, pending] = useActionState(switchHousehold, null);
  return (
    <form action={action} className="stack compact">
      <label>
        Household
        <select name="householdId" defaultValue={currentId} disabled={pending}>
          {memberships.map((membership) => (
            <option key={membership.household_id} value={membership.household_id}>
              {membership.households.name}
            </option>
          ))}
        </select>
      </label>
      <button className="button secondary small" disabled={pending}>
        {pending ? "Switching..." : "Switch"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function InvitationForm() {
  const [state, action, pending] = useActionState(createInvitation, null);
  return (
    <form action={action} className="stack">
      <label>
        Member email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {state?.ok ? (
        <label>
          Share this private invitation link
          <input
            readOnly
            value={state.data.invitationUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      ) : (
        <Feedback state={state} />
      )}
      <button className="button primary" disabled={pending}>
        {pending ? "Creating..." : "Create seven-day invitation"}
      </button>
    </form>
  );
}

export function RemoveMemberForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(removeHouseholdMember, null);
  return (
    <form action={action} className="member-action">
      <input name="userId" type="hidden" value={userId} />
      <button className="button danger small" disabled={pending}>
        {pending ? "Removing..." : "Remove"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
