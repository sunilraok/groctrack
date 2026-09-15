import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/households";
import { InventoryItemScreen } from "@/components/screens";
import type {
  InventoryStockItem,
  InventoryTransaction,
} from "@/types/database";
import {
  InventoryChangeForm,
  ReverseTransactionForm,
} from "../../forms";

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
  return (
    <InventoryItemScreen
      changeForm={<InventoryChangeForm item={item} />}
      item={item}
      reversalFor={(transaction) => (
        <ReverseTransactionForm itemId={item.id} transaction={transaction} />
      )}
      transactions={transactions}
    />
  );
}
