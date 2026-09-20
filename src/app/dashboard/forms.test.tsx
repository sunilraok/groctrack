// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryItem, InventoryTransaction } from "@/types/database";

const actionMocks = vi.hoisted(() => ({
  recordInventoryChange: vi.fn(),
  reverseInventoryTransaction: vi.fn(),
}));

vi.mock("./actions", () => ({
  createGrocery: vi.fn(),
  createHousehold: vi.fn(),
  createInvitation: vi.fn(),
  recordInventoryChange: actionMocks.recordInventoryChange,
  removeHouseholdMember: vi.fn(),
  reverseInventoryTransaction: actionMocks.reverseInventoryTransaction,
  switchHousehold: vi.fn(),
}));

import { InventoryChangeForm, ReverseTransactionForm } from "./forms";

const item: GroceryItem = {
  id: "33333333-3333-4333-8333-333333333333",
  household_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Flour",
  normalized_name: "flour",
  category: "Baking",
  unit_dimension: "mass",
  base_unit: "g",
  low_stock_threshold: "500",
  is_active: true,
  created_by: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-09-13T00:00:00Z",
  updated_at: "2026-09-13T00:00:00Z",
};

const transaction: InventoryTransaction = {
  id: "44444444-4444-4444-8444-444444444444",
  household_id: item.household_id,
  grocery_item_id: item.id,
  transaction_type: "consumption",
  quantity_base: "-1.000000",
  original_quantity: "1.000000",
  original_unit: "g",
  source_receipt_line_id: null,
  reverses_transaction_id: null,
  operation_id: "55555555-5555-4555-8555-555555555555",
  note: null,
  created_by: item.created_by,
  created_at: "2026-09-13T00:00:00Z",
};

describe("inventory forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("shows consumption and adjustment controls with only compatible units", () => {
    render(<InventoryChangeForm item={item} />);

    expect(screen.getByRole("option", { name: "Consumption" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Adjustment" })).toBeVisible();
    expect(screen.getByRole("option", { name: "g" })).toBeVisible();
    expect(screen.getByRole("option", { name: "kg" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "ml" })).not.toBeInTheDocument();
  });

  it("retains an operation UUID after failure and rotates only after success", async () => {
    const firstId = "66666666-6666-4666-8666-666666666666";
    const secondId = "77777777-7777-4777-8777-777777777777";
    const randomUUID = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce(firstId)
      .mockReturnValueOnce(secondId);
    actionMocks.recordInventoryChange
      .mockResolvedValueOnce({ ok: false, error: "retry me" })
      .mockResolvedValueOnce({ ok: true, data: { completionId: "completed-1" } })
      .mockResolvedValueOnce({ ok: false, error: "second operation" });

    const { container } = render(<InventoryChangeForm item={item} />);
    const form = container.querySelector("form")!;
    const operationInput = container.querySelector<HTMLInputElement>(
      'input[name="operationId"]',
    )!;
    const quantityInput = screen.getByLabelText("Quantity");
    fireEvent.change(quantityInput, { target: { value: "1" } });

    await act(async () => fireEvent.submit(form));
    await screen.findByRole("alert");
    expect(operationInput.value).toBe(firstId);

    await act(async () => fireEvent.submit(form));
    await waitFor(() => expect(operationInput.value).toBe(""));

    await act(async () => fireEvent.submit(form));
    await waitFor(() => expect(operationInput.value).toBe(secondId));
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("renders a reversal form with the exact transaction and item IDs", () => {
    const { container } = render(
      <ReverseTransactionForm itemId={item.id} transaction={transaction} />,
    );

    expect(screen.getByRole("button", { name: "Reverse" })).toBeVisible();
    expect(
      container.querySelector<HTMLInputElement>('input[name="groceryItemId"]')
        ?.value,
    ).toBe(item.id);
    expect(
      container.querySelector<HTMLInputElement>('input[name="transactionId"]')
        ?.value,
    ).toBe(transaction.id);
  });
});
