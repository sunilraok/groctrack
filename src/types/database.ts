export type HouseholdRole = "owner" | "member";
export type UnitDimension = "mass" | "volume" | "count";
export type InventoryTransactionType =
  | "purchase"
  | "consumption"
  | "adjustment"
  | "reversal";
export type ReceiptStatus =
  | "pending"
  | "processing"
  | "review_ready"
  | "failed"
  | "posted"
  | "voided";

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

export interface InventoryStockItem extends GroceryItem {
  quantity_base: string;
  balance_updated_at: string | null;
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
  operation_id: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface Receipt {
  id: string;
  household_id: string;
  uploaded_by: string;
  upload_id: string;
  image_path: string;
  original_filename: string;
  content_type: string;
  object_size: number | null;
  status: ReceiptStatus;
  merchant_id: string | null;
  purchased_at: string | null;
  currency: string | null;
  subtotal: string | null;
  discount: string | null;
  tax: string | null;
  total: string | null;
  extraction_warnings: string[];
  extraction_error: string | null;
  extraction_error_code: string | null;
  extraction_retryable: boolean;
  created_at: string;
  merchants: { name: string } | null;
}
