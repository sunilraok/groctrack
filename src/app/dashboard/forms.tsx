"use client";

import { useActionState, useEffect, useRef } from "react";
import type {
  GroceryItem,
  HouseholdMembership,
  InventoryTransaction,
} from "@/types/database";
import {
  createGrocery,
  createHousehold,
  createInvitation,
  recordInventoryChange,
  removeHouseholdMember,
  reverseInventoryTransaction,
  switchHousehold,
  type FormState,
} from "./actions";
import {
  FeedbackView,
  GroceryFormView,
  HouseholdFormView,
  HouseholdSwitcherView,
  InventoryChangeFormView,
  InvitationFormView,
  RemoveMemberFormView,
  ReverseTransactionFormView,
} from "@/components/form-views";

export function Feedback({ state }: { state: FormState<unknown> }) {
  return <FeedbackView state={state} />;
}

export function HouseholdForm() {
  const [state, action, pending] = useActionState(createHousehold, null);
  return <HouseholdFormView action={action} pending={pending} state={state} />;
}

export function GroceryForm() {
  const [state, action, pending] = useActionState(createGrocery, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return <GroceryFormView action={action} formRef={formRef} pending={pending} state={state} />;
}

export function InventoryChangeForm({ item }: { item: GroceryItem }) {
  const [state, action, pending] = useActionState(recordInventoryChange, null);
  return (
    <InventoryChangeFormView
      action={action}
      completionId={state?.ok ? state.data.completionId : null}
      item={item}
      pending={pending}
      state={state}
    />
  );
}

export function ReverseTransactionForm({
  itemId,
  transaction,
}: {
  itemId: string;
  transaction: InventoryTransaction;
}) {
  const [state, action, pending] = useActionState(
    reverseInventoryTransaction,
    null,
  );
  return <ReverseTransactionFormView action={action} itemId={itemId} pending={pending} state={state} transaction={transaction} />;
}

export function HouseholdSwitcher({
  memberships,
  currentId,
}: {
  memberships: HouseholdMembership[];
  currentId: string;
}) {
  const [state, action, pending] = useActionState(switchHousehold, null);
  return <HouseholdSwitcherView action={action} currentId={currentId} memberships={memberships} pending={pending} state={state} />;
}

export function InvitationForm() {
  const [state, action, pending] = useActionState(createInvitation, null);
  return <InvitationFormView action={action} pending={pending} state={state} />;
}

export function RemoveMemberForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(removeHouseholdMember, null);
  return <RemoveMemberFormView action={action} pending={pending} state={state} userId={userId} />;
}
