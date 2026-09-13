import Link from "next/link";
import { requireHousehold } from "@/lib/households";
import { formatQuantity, isLowStock } from "@/lib/units";
import type { GroceryItem } from "@/types/database";
import { GroceryForm } from "./forms";

export default async function DashboardPage() {
  const { supabase, current } = await requireHousehold();
  const [
    { data: groceryData, error: groceryError },
    { data: balanceData, error: balanceError },
  ] = await Promise.all([
      supabase
        .from("grocery_items")
        .select("*")
        .eq("household_id", current.household_id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("inventory_balances")
        .select("grocery_item_id, quantity_base")
        .eq("household_id", current.household_id),
    ]);
  if (groceryError) throw new Error(groceryError.message);
  if (balanceError) throw new Error(balanceError.message);

  const groceries = (groceryData ?? []) as GroceryItem[];
  const quantities = new Map(
    (balanceData ?? []).map((balance) => [
      balance.grocery_item_id,
      balance.quantity_base,
    ]),
  );
  const lowStockCount = groceries.filter((item) =>
    isLowStock(quantities.get(item.id) ?? "0", item.low_stock_threshold),
  ).length;

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{current.households.name}</p>
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
      <div className="dashboard-grid">
        <section className="card panel">
          <div className="panel-heading">
            <h2>Stock</h2>
            <span className="item-meta">{groceries.length} items</span>
          </div>
          {groceries.length === 0 ? (
            <div className="empty-state">
              <h3>Your inventory is empty</h3>
              <p>Add a grocery to begin tracking household stock.</p>
            </div>
          ) : (
            <div className="inventory-list">
              {groceries.map((item) => {
                const quantity = quantities.get(item.id) ?? "0";
                const low = isLowStock(quantity, item.low_stock_threshold);
                return (
                  <Link
                    className="inventory-row"
                    href={`/dashboard/items/${item.id}`}
                    key={item.id}
                  >
                    <div>
                      <div className="item-name">{item.name}</div>
                      <div className="item-meta">
                        {item.category || "Uncategorized"}
                      </div>
                    </div>
                    <div className="quantity">
                      {formatQuantity(quantity, item.unit_dimension)}
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
          <GroceryForm />
        </section>
      </div>
    </main>
  );
}
