"use client";

import { useEffect, useRef, useState } from "react";
import type {
  GroceryItem,
  HouseholdMembership,
  InventoryTransaction,
} from "@/types/database";
import { type InventoryUnit, unitDefinitions } from "@/lib/units";

export type ViewState<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string }
  | null;

export function AuthFeedbackView({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  return (
    <>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success">{message}</p>}
    </>
  );
}

export function AuthFormView({
  action,
  mode,
  next,
  onModeChange,
  pending,
  state,
}: {
  action: (formData: FormData) => void;
  mode: "sign-in" | "sign-up";
  next: string;
  onModeChange: (mode: "sign-in" | "sign-up") => void;
  pending: boolean;
  state: { error?: string; message?: string };
}) {
  return (
    <section className="card auth-card">
      <div className="segmented" aria-label="Authentication mode">
        <button className={mode === "sign-in" ? "active" : ""} onClick={() => onModeChange("sign-in")} type="button">Sign in</button>
        <button className={mode === "sign-up" ? "active" : ""} onClick={() => onModeChange("sign-up")} type="button">Create account</button>
      </div>
      <form action={action} className="stack">
        <input name="next" type="hidden" value={next} />
        {mode === "sign-up" && <label>Name<input name="displayName" autoComplete="name" required /></label>}
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>
          Password
          <input name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={8} maxLength={128} required />
        </label>
        <AuthFeedbackView {...state} />
        <button className="button primary" disabled={pending}>
          {pending ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </section>
  );
}

export function FeedbackView({ state }: { state: ViewState<unknown> }) {
  if (!state) return null;
  return state.ok ? <p className="form-success">Saved.</p> : <p className="form-error" role="alert">{state.error}</p>;
}

type FormAction = (formData: FormData) => void;

export function HouseholdFormView({ action, pending, state }: { action: FormAction; pending: boolean; state: ViewState }) {
  return (
    <form action={action} className="stack">
      <label>Household name<input name="name" placeholder="Rao household" maxLength={80} required /></label>
      <FeedbackView state={state} />
      <button className="button primary" disabled={pending}>{pending ? "Creating..." : "Create household"}</button>
    </form>
  );
}

export function GroceryFormView({
  action,
  formRef,
  pending,
  state,
}: {
  action: FormAction;
  formRef?: React.RefObject<HTMLFormElement | null>;
  pending: boolean;
  state: ViewState;
}) {
  return (
    <form action={action} className="form-grid" ref={formRef}>
      <label>Grocery name<input name="name" maxLength={120} placeholder="Brown rice" required /></label>
      <label>Category<input name="category" maxLength={80} placeholder="Pantry" /></label>
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
        <input name="lowStockThreshold" inputMode="decimal" pattern="\d{1,12}(\.\d{1,6})?" placeholder="500" />
      </label>
      <div className="full"><FeedbackView state={state} /></div>
      <button className="button primary full" disabled={pending}>{pending ? "Adding..." : "Add grocery"}</button>
    </form>
  );
}

export function InventoryChangeFormView({
  action,
  item,
  onSubmit,
  pending,
  state,
}: {
  action: FormAction;
  item: GroceryItem;
  onSubmit?: (formData: FormData) => void;
  pending: boolean;
  state: ViewState<unknown>;
}) {
  const operationIdRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.ok && operationIdRef.current) operationIdRef.current.value = "";
  }, [state?.ok, state?.ok ? state.data : undefined]);
  const compatibleUnits = Object.entries(unitDefinitions).filter(
    ([, definition]) => definition.dimension === item.unit_dimension,
  ) as Array<[InventoryUnit, (typeof unitDefinitions)[InventoryUnit]]>;

  return (
    <form
      action={action}
      className="form-grid"
      onSubmit={(event) => {
        if (operationIdRef.current && !operationIdRef.current.value) {
          operationIdRef.current.value = crypto.randomUUID();
        }
        if (onSubmit) {
          event.preventDefault();
          onSubmit(new FormData(event.currentTarget));
        }
      }}
    >
      <input type="hidden" name="groceryItemId" value={item.id} />
      <input name="operationId" ref={operationIdRef} type="hidden" />
      <label>Change type<select name="type" defaultValue="consumption"><option value="consumption">Consumption</option><option value="adjustment">Adjustment</option></select></label>
      <label>Quantity<input name="quantity" inputMode="decimal" pattern="-?\d{1,12}(\.\d{1,6})?" placeholder="1.5" required /></label>
      <label>
        Unit
        <select name="unit" defaultValue={item.base_unit}>
          {compatibleUnits.map(([value, definition]) => <option value={value} key={value}>{definition.label}</option>)}
        </select>
      </label>
      <label>Note<input name="note" maxLength={250} placeholder="Dinner prep" /></label>
      <p className="quiet-note full">Consumption subtracts a positive amount. For adjustments, use a negative quantity to remove stock.</p>
      <div className="full"><FeedbackView state={state} /></div>
      <button className="button primary full" disabled={pending}>{pending ? "Recording..." : "Record change"}</button>
    </form>
  );
}

export function ReverseTransactionFormView({
  action,
  itemId,
  pending,
  state,
  transaction,
}: {
  action: FormAction;
  itemId: string;
  pending: boolean;
  state: ViewState<unknown>;
  transaction: InventoryTransaction;
}) {
  return (
    <form action={action} className="transaction-action">
      <input name="groceryItemId" type="hidden" value={itemId} />
      <input name="transactionId" type="hidden" value={transaction.id} />
      <button className="button ghost small" disabled={pending}>{pending ? "Reversing..." : "Reverse"}</button>
      <FeedbackView state={state} />
    </form>
  );
}

export function HouseholdSwitcherView({
  action,
  currentId,
  memberships,
  pending,
  state,
}: {
  action: FormAction;
  currentId: string;
  memberships: HouseholdMembership[];
  pending: boolean;
  state: ViewState;
}) {
  return (
    <form action={action} className="stack compact">
      <label>
        Household
        <select name="householdId" defaultValue={currentId} disabled={pending}>
          {memberships.map((membership) => <option key={membership.household_id} value={membership.household_id}>{membership.households.name}</option>)}
        </select>
      </label>
      <button className="button secondary small" disabled={pending}>{pending ? "Switching..." : "Switch"}</button>
      <FeedbackView state={state} />
    </form>
  );
}

export function InvitationFormView({
  action,
  pending,
  state,
}: {
  action: FormAction;
  pending: boolean;
  state: ViewState<{ invitationUrl: string }>;
}) {
  return (
    <form action={action} className="stack">
      <label>Member email<input name="email" type="email" autoComplete="email" required /></label>
      {state?.ok ? (
        <label>
          Share this private invitation link
          <input readOnly value={state.data.invitationUrl} onFocus={(event) => event.currentTarget.select()} />
        </label>
      ) : <FeedbackView state={state} />}
      <button className="button primary" disabled={pending}>{pending ? "Creating..." : "Create seven-day invitation"}</button>
    </form>
  );
}

export function RemoveMemberFormView({
  action,
  pending,
  state,
  userId,
}: {
  action: FormAction;
  pending: boolean;
  state: ViewState;
  userId: string;
}) {
  return (
    <form action={action} className="member-action">
      <input name="userId" type="hidden" value={userId} />
      <button className="button danger small" disabled={pending}>{pending ? "Removing..." : "Remove"}</button>
      <FeedbackView state={state} />
    </form>
  );
}

export function InviteFormView({
  action,
  pending,
  state,
  token,
}: {
  action: FormAction;
  pending: boolean;
  state: ViewState;
  token: string;
}) {
  return (
    <form action={action} className="stack">
      <input name="token" type="hidden" value={token} />
      {state && !state.ok && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button primary" disabled={pending}>{pending ? "Joining..." : "Accept invitation"}</button>
    </form>
  );
}

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export interface ReceiptUploadResult {
  ok: boolean;
  error?: string;
  status?: string;
}

export function ReceiptUploadFormView({
  onRefresh,
  upload,
}: {
  onRefresh: () => void;
  upload: (formData: FormData) => Promise<ReceiptUploadResult>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadIdRef = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size < 1) {
      setMessage("Choose a receipt image or PDF.");
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setMessage("Receipt files cannot exceed 10 MiB.");
      return;
    }

    setPending(true);
    setMessage(null);
    uploadIdRef.current ??= crypto.randomUUID();
    formData.set("uploadId", uploadIdRef.current);
    try {
      const result = await upload(formData);
      if (!result.ok) {
        setMessage(result.error ?? "Receipt upload failed.");
        return;
      }
      setMessage(
        result.status === "review_ready"
          ? "Receipt uploaded and extracted."
          : "Receipt uploaded. Extraction needs attention.",
      );
      if (inputRef.current) inputRef.current.value = "";
      uploadIdRef.current = null;
      onRefresh();
    } catch {
      setMessage("Receipt upload could not reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="receipt-upload"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget));
      }}
    >
      <label className="receipt-file-picker">
        <span>Receipt image or PDF</span>
        <input accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" disabled={pending} name="file" ref={inputRef} required type="file" />
        <small>JPEG, PNG, WebP, or PDF; maximum 10 MiB.</small>
      </label>
      {message && <p className={message.includes("uploaded") ? "form-success" : "form-error"} role="status">{message}</p>}
      <button className="button primary" disabled={pending}>{pending ? "Uploading and extracting..." : "Upload receipt"}</button>
    </form>
  );
}

export function RetryExtractionButtonView({
  onRefresh,
  processing = false,
  retry,
}: {
  onRefresh: () => void;
  processing?: boolean;
  retry: () => Promise<boolean>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retryExtraction() {
    setPending(true);
    setError(null);
    try {
      if (!(await retry())) {
        setError("Unable to retry extraction.");
        return;
      }
      onRefresh();
    } catch {
      setError("Unable to retry extraction.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="receipt-retry">
      <button className="button ghost small" disabled={pending} onClick={retryExtraction} type="button">
        {pending ? "Checking..." : processing ? "Check or recover extraction" : "Retry extraction"}
      </button>
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
