import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireHousehold } from "@/lib/households";
import { formatQuantity } from "@/lib/units";
import type { GroceryItem, InventoryTransaction } from "@/types/database";
import { InventoryChangeForm } from "../../forms";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, current } = await requireHousehold();
  const [{ data: itemData }, { data: balance }, { data: transactions }] =
    await Promise.all([
      supabase
        .from("grocery_items")
        .select("*")
        .eq("id", id)
        .eq("household_id", current.household_id)
        .single(),
      supabase
        .from("inventory_balances")
        .select("quantity_base")
        .eq("grocery_item_id", id)
        .maybeSingle(),
      supabase
        .from("inventory_transactions")
        .select("*")
        .eq("grocery_item_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (!itemData) notFound();
  const item = itemData as GroceryItem;
  const history = (transactions ?? []) as InventoryTransaction[];

  return (
    <main className="page">
      <Link className="quiet-note" href="/dashboard">
        <ArrowLeft size={16} /> Back to inventory
      </Link>
      <header className="page-header">
        <div>
          <p className="eyebrow">{item.category || "Grocery"}</p>
          <h1>{item.name}</h1>
          <p>
            Current stock:{" "}
            <strong>{formatQuantity(balance?.quantity_base ?? "0", item.unit_dimension)}</strong>
          </p>
        </div>
      </header>
      <div className="dashboard-grid">
        <section className="card panel">
          <div className="panel-heading"><h2>Inventory history</h2></div>
          {history.length === 0 ? (
            <div className="empty-state"><p>No transactions yet.</p></div>
          ) : (
            <div className="inventory-list">
              {history.map((transaction) => (
                <div className="inventory-row" key={transaction.id}>
                  <div>
                    <div className="item-name">{transaction.transaction_type}</div>
                    <div className="item-meta">
                      {new Date(transaction.created_at).toLocaleString()}
                      {transaction.note ? ` · ${transaction.note}` : ""}
                    </div>
                  </div>
                  <div className="quantity">
                    {Number(transaction.quantity_base) > 0 ? "+" : ""}
                    {formatQuantity(transaction.quantity_base, item.unit_dimension)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card panel">
          <div className="panel-heading"><h2>Record consumption</h2></div>
          <InventoryChangeForm item={item} />
        </section>
      </div>
    </main>
  );
}
