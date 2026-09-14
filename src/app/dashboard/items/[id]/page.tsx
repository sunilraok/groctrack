import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/households";
import { formatQuantity, isLowStock } from "@/lib/units";
import type {
  InventoryStockItem,
  InventoryTransaction,
} from "@/types/database";
import {
  InventoryChangeForm,
  ReverseTransactionForm,
} from "../../forms";

const transactionLabels = {
  purchase: "Purchase",
  consumption: "Consumption",
  adjustment: "Adjustment",
  reversal: "Reversal",
} as const;

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, current } = await requireHousehold();
  const [
    { data: itemData, error: itemError },
    { data: transactionData, error: transactionError },
  ] = await Promise.all([
    supabase
      .from("inventory_stock")
      .select("*")
      .eq("id", id)
      .eq("household_id", current.household_id)
      .maybeSingle(),
    supabase
      .from("inventory_transaction_history")
      .select("*")
      .eq("grocery_item_id", id)
      .eq("household_id", current.household_id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (itemError) throw new Error(itemError.message);
  if (!itemData) notFound();
  if (transactionError) throw new Error(transactionError.message);

  const item = itemData as InventoryStockItem;
  const transactions = (transactionData ?? []) as InventoryTransaction[];
  const reversedIds = new Set(
    transactions
      .map((transaction) => transaction.reverses_transaction_id)
      .filter((transactionId): transactionId is string => transactionId !== null),
  );
  const low = isLowStock(item.quantity_base, item.low_stock_threshold);

  return (
    <main className="page">
      <Link className="back-link" href="/dashboard">← Back to inventory</Link>
      <header className="page-header item-header">
        <div>
          <p className="eyebrow">{item.category || "Grocery"}</p>
          <h1>{item.name}</h1>
          <p>
            Current stock:{" "}
            <strong>
              {formatQuantity(item.quantity_base, item.unit_dimension)}
            </strong>
          </p>
        </div>
        <span className={`badge ${low ? "low" : "good"}`}>
          {low ? "Low stock" : "Stocked"}
        </span>
      </header>

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
                    <div className="item-name">
                      {transactionLabels[transaction.transaction_type]}
                    </div>
                    <div className="item-meta">
                      {new Date(transaction.created_at).toLocaleString()}
                      {transaction.note ? ` · ${transaction.note}` : ""}
                    </div>
                  </div>
                  <div className="quantity">
                    {transaction.quantity_base.startsWith("-") ? "" : "+"}
                    {formatQuantity(
                      transaction.quantity_base,
                      item.unit_dimension,
                    )}
                  </div>
                  {transaction.transaction_type !== "reversal" &&
                    !reversedIds.has(transaction.id) && (
                      <ReverseTransactionForm
                        itemId={item.id}
                        transaction={transaction}
                      />
                    )}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card panel">
          <div className="panel-heading"><h2>Record stock change</h2></div>
          <InventoryChangeForm item={item} />
        </section>
      </div>
    </main>
  );
}
