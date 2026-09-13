import Link from "next/link";
import { PackageOpen, Plus, ScanLine } from "lucide-react";
import { requireHousehold } from "@/lib/households";
import { formatQuantity } from "@/lib/units";
import type { InventoryBalance } from "@/types/database";
import { GroceryForm } from "./forms";

export default async function DashboardPage() {
  const { supabase, current } = await requireHousehold();
  const { data, error } = await supabase
    .from("inventory_balances")
    .select("household_id, grocery_item_id, quantity_base, updated_at, grocery_items(*)")
    .eq("household_id", current.household_id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  const balances = (data ?? []) as unknown as InventoryBalance[];
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{current.households.name}</p>
          <h1>Kitchen inventory</h1>
          <p>What your household has on hand right now.</p>
        </div>
        <Link className="button primary" href="/dashboard/receipts/new">
          <ScanLine size={18} /> Scan receipt
        </Link>
      </header>

      <div className="dashboard-grid">
        <section className="card panel">
          <div className="panel-heading">
            <h2>In stock</h2>
            <span className="item-meta">{balances.length} items</span>
          </div>
          {balances.length === 0 ? (
            <div className="empty-state">
              <PackageOpen size={35} />
              <h3>Your pantry is ready</h3>
              <p>Scan a receipt or add a grocery to begin tracking stock.</p>
            </div>
          ) : (
            <div className="inventory-list">
              {balances.map((balance) => {
                const threshold = balance.grocery_items.low_stock_threshold;
                const isLow =
                  threshold !== null &&
                  Number(balance.quantity_base) <= Number(threshold);
                return (
                  <Link
                    className="inventory-row"
                    href={`/dashboard/items/${balance.grocery_item_id}`}
                    key={balance.grocery_item_id}
                  >
                    <div>
                      <div className="item-name">{balance.grocery_items.name}</div>
                      <div className="item-meta">
                        {balance.grocery_items.category || "Uncategorized"}
                      </div>
                    </div>
                    <div className="quantity">
                      {formatQuantity(
                        balance.quantity_base,
                        balance.grocery_items.unit_dimension,
                      )}
                    </div>
                    <span className={`badge ${isLow ? "low" : "good"}`}>
                      {isLow ? "Low stock" : "Stocked"}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="card panel">
          <div className="panel-heading">
            <h2><Plus size={19} /> Add grocery</h2>
          </div>
          <GroceryForm />
        </section>
      </div>
    </main>
  );
}
