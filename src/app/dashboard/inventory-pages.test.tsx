// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InventoryStockItem,
  InventoryTransaction,
} from "@/types/database";

const mocks = vi.hoisted(() => ({
  requireHousehold: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/lib/households", () => ({
  requireHousehold: mocks.requireHousehold,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("./forms", () => ({
  GroceryForm: () => <div>Add grocery form</div>,
  InventoryChangeForm: () => <div>Inventory change form</div>,
  ReverseTransactionForm: ({ transaction }: { transaction: InventoryTransaction }) => (
    <div>Reverse {transaction.id}</div>
  ),
}));

import DashboardPage from "./page";
import InventoryItemPage from "./items/[id]/page";

const stockItem: InventoryStockItem = {
  id: "33333333-3333-4333-8333-333333333333",
  household_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Flour",
  normalized_name: "flour",
  category: "Baking",
  unit_dimension: "mass",
  base_unit: "g",
  low_stock_threshold: "5",
  is_active: true,
  created_by: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-09-13T00:00:00Z",
  updated_at: "2026-09-13T00:00:00Z",
  quantity_base: "-2.000000",
  balance_updated_at: "2026-09-13T00:00:00Z",
};

function queryResult(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    then: result.then.bind(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data, error: null });
  return query;
}

describe("inventory pages", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("renders negative inventory as low stock on the dashboard", async () => {
    const stockQuery = queryResult([stockItem]);
    mocks.requireHousehold.mockResolvedValue({
      current: {
        household_id: stockItem.household_id,
        households: { name: "Home" },
      },
      supabase: { from: vi.fn().mockReturnValue(stockQuery) },
    });

    render(await DashboardPage());

    expect(screen.getByText("Low stock")).toBeVisible();
    expect(screen.getByText("-2 g")).toBeVisible();
    expect(screen.getByText(/1 item needs attention/)).toBeVisible();
  });

  it("renders signed history and hides reversal controls for reversed rows", async () => {
    const transactions: InventoryTransaction[] = [
      {
        id: "44444444-4444-4444-8444-444444444444",
        household_id: stockItem.household_id,
        grocery_item_id: stockItem.id,
        transaction_type: "adjustment",
        quantity_base: "3.000000",
        original_quantity: "3.000000",
        original_unit: "g",
        source_receipt_line_id: null,
        reverses_transaction_id: null,
        operation_id: "55555555-5555-4555-8555-555555555555",
        note: "Count correction",
        created_by: stockItem.created_by,
        created_at: "2026-09-13T00:00:00Z",
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        household_id: stockItem.household_id,
        grocery_item_id: stockItem.id,
        transaction_type: "reversal",
        quantity_base: "-3.000000",
        original_quantity: null,
        original_unit: null,
        source_receipt_line_id: null,
        reverses_transaction_id: "44444444-4444-4444-8444-444444444444",
        operation_id: null,
        note: "Reversed",
        created_by: stockItem.created_by,
        created_at: "2026-09-13T00:01:00Z",
      },
    ];
    const itemQuery = queryResult(stockItem);
    const historyQuery = queryResult(transactions);
    mocks.requireHousehold.mockResolvedValue({
      current: { household_id: stockItem.household_id },
      supabase: {
        from: vi
          .fn()
          .mockReturnValueOnce(itemQuery)
          .mockReturnValueOnce(historyQuery),
      },
    });

    render(
      await InventoryItemPage({
        params: Promise.resolve({ id: stockItem.id }),
      }),
    );

    expect(screen.getByText("+3 g")).toBeVisible();
    expect(screen.getByText("-3 g")).toBeVisible();
    expect(screen.queryByText(/Reverse 44444444/)).not.toBeInTheDocument();
    expect(screen.getByText("Low stock")).toBeVisible();
  });
});
