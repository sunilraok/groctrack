"use client";

import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import {
  createGrocery,
  createHousehold,
  createInvitation,
  recordInventoryChange,
  type FormState,
} from "./actions";
import type { GroceryItem } from "@/types/database";
import { unitDefinitions, type InventoryUnit } from "@/lib/units";

function Feedback({ state }: { state: FormState<unknown> }) {
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
        {pending && <LoaderCircle className="spin" size={18} />}
        Create household
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
        <input name="name" placeholder="Tur dal" required />
      </label>
      <label>
        Category
        <input name="category" placeholder="Pulses" />
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
        <input name="lowStockThreshold" type="number" min="0" step="0.001" placeholder="500" />
      </label>
      <div className="full"><Feedback state={state} /></div>
      <button className="button primary full" disabled={pending}>
        {pending && <LoaderCircle className="spin" size={18} />}
        Add grocery
      </button>
    </form>
  );
}

export function InventoryChangeForm({ item }: { item: GroceryItem }) {
  const [state, action, pending] = useActionState(recordInventoryChange, null);
  const compatibleUnits = Object.entries(unitDefinitions).filter(
    ([, definition]) => definition.dimension === item.unit_dimension,
  ) as Array<[InventoryUnit, (typeof unitDefinitions)[InventoryUnit]]>;

  return (
    <form action={action} className="form-grid">
      <input type="hidden" name="groceryItemId" value={item.id} />
      <input type="hidden" name="type" value="consumption" />
      <input type="hidden" name="direction" value="remove" />
      <label>
        Amount used
        <input name="quantity" type="number" min="0.000001" step="any" required />
      </label>
      <label>
        Unit
        <select name="unit" defaultValue={item.base_unit}>
          {compatibleUnits.map(([value, definition]) => (
            <option value={value} key={value}>{definition.label}</option>
          ))}
        </select>
      </label>
      <label className="full">
        Note (optional)
        <input name="note" maxLength={250} placeholder="Dinner prep" />
      </label>
      <div className="full"><Feedback state={state} /></div>
      <button className="button primary full" disabled={pending}>
        {pending && <LoaderCircle className="spin" size={18} />}
        Record consumption
      </button>
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
          <input readOnly value={state.data.invitationUrl} onFocus={(event) => event.currentTarget.select()} />
        </label>
      ) : (
        <Feedback state={state} />
      )}
      <button className="button primary" disabled={pending}>
        {pending && <LoaderCircle className="spin" size={18} />}
        Create invitation
      </button>
    </form>
  );
}
