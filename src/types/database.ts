export type HouseholdRole = "owner" | "member";
export type UnitDimension = "mass" | "volume" | "count";
export type InventoryTransactionType =
  | "purchase"
  | "consumption"
  | "adjustment"
  | "reversal";

export interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface HouseholdMembership {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  joined_at: string;
  households: Household;
}

export interface HouseholdMember {
  user_id: string;
  role: HouseholdRole;
  joined_at: string;
  profiles: { display_name: string | null } | null;
}

export interface GroceryItem {
  id: string;
  household_id: string;
  name: string;
  normalized_name: string;
  category: string | null;
  unit_dimension: UnitDimension;
  base_unit: string;
  low_stock_threshold: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryBalance {
  household_id: string;
  grocery_item_id: string;
  quantity_base: string;
  updated_at: string;
  grocery_items: GroceryItem;
}

export interface InventoryTransaction {
  id: string;
  household_id: string;
  grocery_item_id: string;
  transaction_type: InventoryTransactionType;
  quantity_base: string;
  original_quantity: string | null;
  original_unit: string | null;
  source_receipt_line_id: string | null;
  reverses_transaction_id: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
}
