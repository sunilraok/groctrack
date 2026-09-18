import Link from "next/link";
import type {
  HouseholdMember,
  HouseholdMembership,
  InventoryStockItem,
  InventoryTransaction,
  Receipt,
} from "@/types/database";
import { formatQuantity, isLowStock } from "@/lib/units";

export function HomeScreen() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-10 shadow-sm sm:p-14">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
          GrocTrack
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Shared grocery inventory, built on a secure foundation.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
          Create a private household, invite the people you live with, and keep
          everyone working from the same grocery list.
        </p>
        <Link
          className="hero-link mt-8 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800"
          href="/auth"
        >
          Sign in or create an account
        </Link>
      </section>
    </main>
  );
}

export function AuthScreen({
  confirmationError = false,
  form,
}: {
  confirmationError?: boolean;
  form: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <Link className="brand" href="/">GrocTrack</Link>
      <section className="auth-copy">
        <p className="eyebrow">Your household, together</p>
        <h1>Share one private grocery workspace.</h1>
        <p>Create a household or join one through an invitation sent to your email.</p>
        {confirmationError && (
          <p className="form-error" role="alert">
            The confirmation link is invalid or expired. Request a new sign-up link.
          </p>
        )}
      </section>
      {form}
    </main>
  );
}

export function InvitationScreen({ form }: { form: React.ReactNode }) {
  return (
    <main className="auth-page single-column">
      <section className="card modal-card">
        <p className="eyebrow">Household invitation</p>
        <h1>Join this household?</h1>
        <p>
          The invitation is accepted only if it is valid, unexpired, and tied
          to your confirmed email address.
        </p>
        {form}
      </section>
    </main>
  );
}

export function OnboardingScreen({ form }: { form: React.ReactNode }) {
  return (
    <main className="page">
      <section className="card modal-card">
        <p className="eyebrow">First things first</p>
        <h1>Create your household</h1>
        <p>Your household data is visible only to people you invite.</p>
        {form}
      </section>
    </main>
  );
}

export function DashboardShell({
  children,
  memberships,
  currentId,
  switcher,
  signOut,
}: {
  children: React.ReactNode;
  memberships: HouseholdMembership[];
  currentId?: string;
  switcher?: React.ReactNode;
  signOut: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">GrocTrack</Link>
        {currentId && (switcher ?? (
          <div className="stack compact">
            <strong>Household</strong>
            <span>{memberships.find((membership) => membership.household_id === currentId)?.households.name}</span>
          </div>
        ))}
        <nav className="side-nav" aria-label="Primary navigation">
          <Link href="/dashboard">Inventory</Link>
          {currentId && <Link href="/dashboard/receipts">Receipts</Link>}
          {currentId && <Link href="/dashboard/settings">Household</Link>}
        </nav>
        <div className="sidebar-footer">{signOut}</div>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}

export function InventoryScreen({
  householdName,
  groceries,
  groceryForm,
  loading = false,
  error,
}: {
  householdName: string;
  groceries: InventoryStockItem[];
  groceryForm: React.ReactNode;
  loading?: boolean;
  error?: string;
}) {
  const lowStockCount = groceries.filter((item) =>
    isLowStock(item.quantity_base, item.low_stock_threshold),
  ).length;

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{householdName}</p>
          <h1>Kitchen inventory</h1>
          <p>
            {lowStockCount} {lowStockCount === 1 ? "item needs" : "items need"}{" "}
            attention.
          </p>
        </div>
        <Link className="button primary" href="/dashboard/settings">
          Manage household
        </Link>
      </header>
      {error && <p className="form-error page-alert" role="alert">{error}</p>}
      <div className="dashboard-grid">
        <section className="card panel" aria-busy={loading}>
          <div className="panel-heading">
            <h2>Stock</h2>
            <span className="item-meta">{groceries.length} items</span>
          </div>
          {loading ? (
            <div className="empty-state"><p>Loading inventory...</p></div>
          ) : groceries.length === 0 ? (
            <div className="empty-state">
              <h3>Your inventory is empty</h3>
              <p>Add a grocery to begin tracking household stock.</p>
            </div>
          ) : (
            <div className="inventory-list">
              {groceries.map((item) => {
                const low = isLowStock(item.quantity_base, item.low_stock_threshold);
                return (
                  <Link className="inventory-row" href={`/dashboard/items/${item.id}`} key={item.id}>
                    <div>
                      <div className="item-name">{item.name}</div>
                      <div className="item-meta">{item.category || "Uncategorized"}</div>
                    </div>
                    <div className="quantity">
                      {formatQuantity(item.quantity_base, item.unit_dimension)}
                    </div>
                    <span className={`badge ${low ? "low" : "good"}`}>
                      {low ? "Low stock" : "Stocked"}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
        <section className="card panel">
          <div className="panel-heading"><h2>Add grocery</h2></div>
          {groceryForm}
        </section>
      </div>
    </main>
  );
}

const transactionLabels = {
  purchase: "Purchase",
  consumption: "Consumption",
  adjustment: "Adjustment",
  reversal: "Reversal",
} as const;

export function InventoryItemScreen({
  item,
  transactions,
  changeForm,
  reversalFor,
  error,
}: {
  item: InventoryStockItem;
  transactions: InventoryTransaction[];
  changeForm: React.ReactNode;
  reversalFor: (transaction: InventoryTransaction) => React.ReactNode;
  error?: string;
}) {
  const reversedIds = new Set(
    transactions
      .map((transaction) => transaction.reverses_transaction_id)
      .filter((id): id is string => id !== null),
  );
  const low = isLowStock(item.quantity_base, item.low_stock_threshold);

  return (
    <main className="page">
      <Link className="back-link" href="/dashboard">← Back to inventory</Link>
      <header className="page-header item-header">
        <div>
          <p className="eyebrow">{item.category || "Grocery"}</p>
          <h1>{item.name}</h1>
          <p>Current stock: <strong>{formatQuantity(item.quantity_base, item.unit_dimension)}</strong></p>
        </div>
        <span className={`badge ${low ? "low" : "good"}`}>{low ? "Low stock" : "Stocked"}</span>
      </header>
      {error && <p className="form-error page-alert" role="alert">{error}</p>}
      <div className="dashboard-grid">
        <section className="card panel">
          <div className="panel-heading"><h2>Transaction history</h2></div>
          {transactions.length === 0 ? (
            <div className="empty-state"><p>No inventory changes yet.</p></div>
          ) : (
            <div className="inventory-list">
              {transactions.map((transaction) => (
                <div className="inventory-row transaction-row" key={transaction.id}>
                  <div>
                    <div className="item-name">{transactionLabels[transaction.transaction_type]}</div>
                    <div className="item-meta">
                      {new Date(transaction.created_at).toLocaleString()}
                      {transaction.note ? ` · ${transaction.note}` : ""}
                    </div>
                  </div>
                  <div className="quantity">
                    {transaction.quantity_base.startsWith("-") ? "" : "+"}
                    {formatQuantity(transaction.quantity_base, item.unit_dimension)}
                  </div>
                  {transaction.transaction_type !== "reversal" &&
                    !reversedIds.has(transaction.id) &&
                    reversalFor(transaction)}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card panel">
          <div className="panel-heading"><h2>Record stock change</h2></div>
          {changeForm}
        </section>
      </div>
    </main>
  );
}

export function SettingsScreen({
  householdName,
  currentUserId,
  role,
  members,
  invitationForm,
  removeMember,
  error,
}: {
  householdName: string;
  currentUserId: string;
  role: "owner" | "member";
  members: HouseholdMember[];
  invitationForm?: React.ReactNode;
  removeMember: (userId: string) => React.ReactNode;
  error?: string;
}) {
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Household settings</p>
          <h1>{householdName}</h1>
          <p>Manage the people who can access this household.</p>
        </div>
      </header>
      {error && <p className="form-error page-alert" role="alert">{error}</p>}
      <div className="dashboard-grid">
        <section className="card panel">
          <div className="panel-heading"><h2>Members</h2></div>
          <div className="member-list">
            {members.map((member) => (
              <div className="member-row" key={member.user_id}>
                <div>
                  <strong>{member.profiles?.display_name || (member.user_id === currentUserId ? "You" : "Household member")}</strong>
                  <span className="badge">{member.role}</span>
                </div>
                {role === "owner" && member.user_id !== currentUserId && removeMember(member.user_id)}
              </div>
            ))}
          </div>
        </section>
        <section className="card panel">
          <div className="panel-heading"><h2>Invite someone</h2></div>
          {role === "owner" ? (
            <>
              <p>Links are tied to the recipient email and expire after seven days.</p>
              {invitationForm}
            </>
          ) : (
            <p className="notice">Only household owners can create invitations.</p>
          )}
        </section>
      </div>
    </main>
  );
}

export const receiptStatusLabels: Record<Receipt["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  review_ready: "Ready for review",
  failed: "Extraction failed",
  posted: "Posted",
  voided: "Voided",
};

export function ReceiptsScreen({
  householdName,
  receipts,
  uploadForm,
  retryFor,
  error,
}: {
  householdName: string;
  receipts: Receipt[];
  uploadForm: React.ReactNode;
  retryFor: (receipt: Receipt) => React.ReactNode;
  error?: string;
}) {
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{householdName}</p>
          <h1>Receipts</h1>
          <p>Private uploads are extracted for review without changing inventory.</p>
        </div>
      </header>
      {error && <p className="form-error page-alert" role="alert">{error}</p>}
      <div className="receipt-grid">
        <section className="card panel">
          <div className="panel-heading"><h2>Upload a receipt</h2></div>
          {uploadForm}
        </section>
        <section className="card panel">
          <div className="panel-heading">
            <h2>Recent receipts</h2>
            <span className="item-meta">{receipts.length} receipts</span>
          </div>
          {receipts.length === 0 ? (
            <div className="empty-state">
              <h3>No receipts yet</h3>
              <p>Use your camera or choose a supported file.</p>
            </div>
          ) : (
            <div className="receipt-list">
              {receipts.map((receipt) => (
                <article className="receipt-row" key={receipt.id}>
                  <div>
                    <a className="item-name receipt-link" href={`/api/receipts/${receipt.id}/image`} rel="noreferrer" target="_blank">
                      {receipt.original_filename}
                    </a>
                    <div className="item-meta">
                      {receipt.merchants?.name ?? "Merchant not identified"}
                      {" · "}
                      {new Date(receipt.created_at).toLocaleString()}
                    </div>
                    {receipt.extraction_error && <p className="form-error">{receipt.extraction_error}</p>}
                  </div>
                  <span className={`badge receipt-status ${receipt.status}`}>{receiptStatusLabels[receipt.status]}</span>
                  {retryFor(receipt)}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
