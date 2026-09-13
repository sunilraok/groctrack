export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type HouseholdRole = "owner" | "member";
export type UnitDimension = "mass" | "volume" | "count";
export type ReceiptStatus =
  | "pending"
  | "processing"
  | "review_ready"
  | "failed"
  | "posted"
  | "voided";
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

export interface Receipt {
  id: string;
  household_id: string;
  uploaded_by: string;
  merchant_id: string | null;
  image_path: string;
  original_filename: string;
  content_type: string;
  status: ReceiptStatus;
  purchased_at: string | null;
  currency: string | null;
  subtotal: string | null;
  discount: string | null;
  tax: string | null;
  total: string | null;
  provider: string | null;
  provider_model: string | null;
  extraction_schema_version: number | null;
  extraction_warnings: Json;
  extraction_error: string | null;
  posted_at: string | null;
  posted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReceiptLine {
  id: string;
  receipt_id: string;
  line_number: number;
  raw_description: string;
  interpreted_description: string | null;
  product_code: string | null;
  quantity: string | null;
  unit: string | null;
  weight: string | null;
  weight_unit: string | null;
  unit_price: string | null;
  line_total: string | null;
  discount: string | null;
  grocery_item_id: string | null;
  save_alias: boolean;
  is_ambiguous: boolean;
  validation_warnings: Json;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  household_id: string;
  grocery_item_id: string;
  transaction_type: InventoryTransactionType;
  quantity_base: string;
  original_quantity: string | null;
  original_unit: string | null;
  note: string | null;
  created_at: string;
}
