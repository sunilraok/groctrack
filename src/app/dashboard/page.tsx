import { requireHousehold } from "@/lib/households";
import { InventoryScreen } from "@/components/screens";
import type { InventoryStockItem } from "@/types/database";
import { GroceryForm } from "./forms";

export default async function DashboardPage() {
  const { supabase, current } = await requireHousehold();
  const { data, error } = await supabase
    .from("inventory_stock")
    .select("*")
    .eq("household_id", current.household_id)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);

  const groceries = (data ?? []) as InventoryStockItem[];
  return (
    <InventoryScreen
      groceries={groceries}
      groceryForm={<GroceryForm />}
      householdName={current.households.name}
    />
  );
}
