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
import { type InventoryUnit, unitDefinitions } from "@/lib/units";

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

export function GroceryForm() {
  const [state, action, pending] = useActionState(createGrocery, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form action={action} className="form-grid" ref={formRef}>
      <label>
        Grocery name
        <input name="name" maxLength={120} placeholder="Brown rice" required />
      </label>
      <label>
        Category
        <input name="category" maxLength={80} placeholder="Pantry" />
      </label>
      <label>
        Tracked as
        <select name="dimension" defaultValue="mass">
          <option value="mass">Weight (g / kg)</option>
          <option value="volume">Volume (ml / L)</option>
          <option value="count">Count (each / dozen)</option>
        </select>
      </label>
      <label>
        Low-stock threshold (base unit)
        <input
          name="lowStockThreshold"
          inputMode="decimal"
          pattern="\d{1,12}(\.\d{1,6})?"
          placeholder="500"
        />
      </label>
      <div className="full"><Feedback state={state} /></div>
      <button className="button primary full" disabled={pending}>
        {pending ? "Adding..." : "Add grocery"}
      </button>
    </form>
  );
}

export function InventoryChangeForm({ item }: { item: GroceryItem }) {
  const [state, action, pending] = useActionState(recordInventoryChange, null);
  const operationIdRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.ok && operationIdRef.current) {
      operationIdRef.current.value = "";
    }
  }, [state]);
  const compatibleUnits = Object.entries(unitDefinitions).filter(
    ([, definition]) => definition.dimension === item.unit_dimension,
  ) as Array<[InventoryUnit, (typeof unitDefinitions)[InventoryUnit]]>;

  return (
    <form
      action={action}
      className="form-grid"
      onSubmit={() => {
        if (operationIdRef.current && !operationIdRef.current.value) {
          operationIdRef.current.value = crypto.randomUUID();
        }
      }}
    >
      <input type="hidden" name="groceryItemId" value={item.id} />
      <input name="operationId" ref={operationIdRef} type="hidden" />
      <label>
        Change type
        <select name="type" defaultValue="consumption">
          <option value="consumption">Consumption</option>
          <option value="adjustment">Adjustment</option>
        </select>
      </label>
      <label>
        Quantity
        <input
          name="quantity"
          inputMode="decimal"
          pattern="-?\d{1,12}(\.\d{1,6})?"
          placeholder="1.5"
          required
        />
      </label>
      <label>
        Unit
        <select name="unit" defaultValue={item.base_unit}>
          {compatibleUnits.map(([value, definition]) => (
            <option value={value} key={value}>{definition.label}</option>
          ))}
        </select>
      </label>
      <label>
        Note
        <input name="note" maxLength={250} placeholder="Dinner prep" />
      </label>
      <p className="quiet-note full">
        Consumption subtracts a positive amount. For adjustments, use a negative
        quantity to remove stock.
      </p>
      <div className="full"><Feedback state={state} /></div>
      <button className="button primary full" disabled={pending}>
        {pending ? "Recording..." : "Record change"}
      </button>
    </form>
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
  return (
    <form action={action} className="transaction-action">
      <input name="groceryItemId" type="hidden" value={itemId} />
      <input name="transactionId" type="hidden" value={transaction.id} />
      <button className="button ghost small" disabled={pending}>
        {pending ? "Reversing..." : "Reverse"}
      </button>
      <Feedback state={state} />
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
