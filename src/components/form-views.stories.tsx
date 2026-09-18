import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { GroceryItem, HouseholdMembership, InventoryTransaction } from "@/types/database";
import {
  AuthFeedbackView,
  AuthFormView,
  FeedbackView,
  GroceryFormView,
  HouseholdFormView,
  HouseholdSwitcherView,
  InventoryChangeFormView,
  InvitationFormView,
  InviteFormView,
  ReceiptUploadFormView,
  RemoveMemberFormView,
  RetryExtractionButtonView,
  ReverseTransactionFormView,
  type ViewState,
} from "./form-views";

const meta = {
  title: "Forms/Production views",
  decorators: [
    (Story) => <div className="card panel" style={{ margin: 32, maxWidth: 600 }}><Story /></div>,
  ],
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = fn((_formData: FormData) => undefined);
function storyFile(canvasElement: HTMLElement, name = "receipt.png") {
  const FileConstructor = canvasElement.ownerDocument.defaultView!.File;
  return new FileConstructor(["receipt"], name, { type: "image/png" });
}

function setStoryFile(canvasElement: HTMLElement) {
  const input = within(canvasElement).getByLabelText(/Receipt image or PDF/) as HTMLInputElement;
  const view = canvasElement.ownerDocument.defaultView!;
  const transfer = new view.DataTransfer();
  transfer.items.add(storyFile(canvasElement));
  input.files = transfer.files;
  input.dispatchEvent(new view.Event("change", { bubbles: true }));
  return input;
}
const householdId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "11111111-1111-4111-8111-111111111111";
const item: GroceryItem = {
  id: "33333333-3333-4333-8333-333333333333",
  household_id: householdId,
  name: "Brown rice",
  normalized_name: "brown rice",
  category: "Pantry",
  unit_dimension: "mass",
  base_unit: "g",
  low_stock_threshold: "500",
  is_active: true,
  created_by: userId,
  created_at: "2026-09-13T12:00:00Z",
  updated_at: "2026-09-13T12:00:00Z",
};
const transaction: InventoryTransaction = {
  id: "44444444-4444-4444-8444-444444444444",
  household_id: householdId,
  grocery_item_id: item.id,
  transaction_type: "purchase",
  quantity_base: "1000",
  original_quantity: "1",
  original_unit: "kg",
  source_receipt_line_id: null,
  reverses_transaction_id: null,
  operation_id: "55555555-5555-4555-8555-555555555555",
  note: "Initial stock",
  created_by: userId,
  created_at: "2026-09-13T12:00:00Z",
};
const memberships: HouseholdMembership[] = [{
  household_id: householdId,
  user_id: userId,
  role: "owner",
  joined_at: "2026-09-13T12:00:00Z",
  households: {
    id: householdId,
    name: "Rao household",
    created_by: userId,
    created_at: "2026-09-13T12:00:00Z",
    updated_at: "2026-09-13T12:00:00Z",
  },
}];

function AuthHarness({ pending = false, state = {} }: { pending?: boolean; state?: { error?: string; message?: string } }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  return <AuthFormView action={noop} mode={mode} next="/dashboard" onModeChange={setMode} pending={pending} state={state} />;
}

function InventoryRetryHarness() {
  const [state, setState] = useState<ViewState>(null);
  const [attempt, setAttempt] = useState(0);
  return (
    <InventoryChangeFormView
      action={(formData) => {
        void formData;
      }}
      completionId={state?.ok ? `completion-${attempt}` : null}
      onSubmit={(formData) => {
        const currentAttempt = attempt + 1;
        setAttempt(currentAttempt);
        setState(currentAttempt === 1 ? { ok: false, error: "Retry the operation." } : { ok: true, data: undefined });
        void formData;
      }}
      item={item}
      pending={false}
      state={state}
    />
  );
}

export const AuthSignIn: Story = {
  render: () => <AuthHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  },
};
export const AuthSignUpInteraction: Story = {
  render: () => <AuthHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(within(canvas.getByLabelText("Authentication mode")).getByRole("button", { name: "Create account" }));
    await expect(canvas.getByLabelText("Name")).toBeVisible();
    await expect(canvas.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  },
};
export const AuthPending: Story = { render: () => <AuthHarness pending /> };
export const AuthValidationError: Story = { render: () => <AuthHarness state={{ error: "Enter a valid email." }} /> };
export const AuthSuccess: Story = { render: () => <AuthHarness state={{ message: "Check your email to confirm your account." }} /> };
export const AuthFeedbackError: Story = { render: () => <AuthFeedbackView error="Unable to sign in." /> };
export const DashboardFeedbackSuccess: Story = { render: () => <FeedbackView state={{ ok: true, data: undefined }} /> };
export const DashboardFeedbackError: Story = { render: () => <FeedbackView state={{ ok: false, error: "Unable to save." }} /> };
export const HouseholdDefault: Story = { render: () => <HouseholdFormView action={noop} pending={false} state={null} /> };
export const HouseholdPending: Story = { render: () => <HouseholdFormView action={noop} pending state={null} /> };
export const HouseholdError: Story = { render: () => <HouseholdFormView action={noop} pending={false} state={{ ok: false, error: "Enter a household name." }} /> };
export const GroceryDimensions: Story = {
  render: () => <GroceryFormView action={noop} pending={false} state={null} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("option", { name: "Weight (g / kg)" })).toBeVisible();
    await expect(canvas.getByRole("option", { name: "Volume (ml / L)" })).toBeVisible();
    await expect(canvas.getByRole("option", { name: "Count (each / dozen)" })).toBeVisible();
  },
};
export const GroceryPending: Story = { render: () => <GroceryFormView action={noop} pending state={null} /> };
export const GroceryError: Story = { render: () => <GroceryFormView action={noop} pending={false} state={{ ok: false, error: "That grocery already exists." }} /> };
export const InventoryCompatibleUnits: Story = {
  render: () => <InventoryChangeFormView action={noop} item={item} pending={false} state={null} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("option", { name: "g" })).toBeVisible();
    await expect(canvas.getByRole("option", { name: "kg" })).toBeVisible();
    await expect(canvas.queryByRole("option", { name: "ml" })).not.toBeInTheDocument();
    await userEvent.selectOptions(canvas.getByLabelText("Change type"), "adjustment");
  },
};
export const InventoryPending: Story = { render: () => <InventoryChangeFormView action={noop} item={item} pending state={null} /> };
export const InventoryError: Story = { render: () => <InventoryChangeFormView action={noop} item={item} pending={false} state={{ ok: false, error: "Enter a valid non-zero quantity and unit." }} /> };
export const InventoryOperationRetry: Story = {
  render: () => <InventoryRetryHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const quantity = canvas.getByLabelText("Quantity");
    await userEvent.type(quantity, "1");
    await userEvent.click(canvas.getByRole("button", { name: "Record change" }));
    const operation = canvasElement.querySelector<HTMLInputElement>('input[name="operationId"]');
    await expect(operation?.value).toMatch(/^[0-9a-f-]{36}$/);
    const firstId = operation?.value;
    await userEvent.click(canvas.getByRole("button", { name: "Record change" }));
    await expect(operation?.value).toBe("");
    await expect(firstId).not.toBe("");
  },
};
export const ReverseDefault: Story = { render: () => <ReverseTransactionFormView action={noop} itemId={item.id} pending={false} state={null} transaction={transaction} /> };
export const ReversePending: Story = { render: () => <ReverseTransactionFormView action={noop} itemId={item.id} pending state={null} transaction={transaction} /> };
export const HouseholdSwitcher: Story = { render: () => <HouseholdSwitcherView action={noop} currentId={householdId} memberships={memberships} pending={false} state={null} /> };
export const InvitationDefault: Story = { render: () => <InvitationFormView action={noop} pending={false} state={null} /> };
export const InvitationPending: Story = { render: () => <InvitationFormView action={noop} pending state={null} /> };
export const InvitationSuccess: Story = {
  render: () => <InvitationFormView action={noop} pending={false} state={{ ok: true, data: { invitationUrl: "http://localhost:3000/invite/fixed-token" } }} />,
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText("Share this private invitation link");
    await userEvent.click(input);
    await expect(input).toHaveValue("http://localhost:3000/invite/fixed-token");
  },
};
export const InvitationError: Story = { render: () => <InvitationFormView action={noop} pending={false} state={{ ok: false, error: "Invitation expired." }} /> };
export const RemoveMember: Story = { render: () => <RemoveMemberFormView action={noop} pending={false} state={null} userId="22222222-2222-4222-8222-222222222222" /> };
export const AcceptInvitation: Story = { render: () => <InviteFormView action={noop} pending={false} state={null} token="fixed-invitation-token" /> };
export const AcceptInvitationError: Story = { render: () => <InviteFormView action={noop} pending={false} state={{ ok: false, error: "Invitation expired." }} token="fixed-invitation-token" /> };
export const ReceiptUploadValidation: Story = {
  render: () => <ReceiptUploadFormView onRefresh={fn()} upload={fn(async () => ({ ok: true, status: "review_ready" }))} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByLabelText(/Receipt image or PDF/).removeAttribute("required");
    await userEvent.click(canvas.getByRole("button", { name: "Upload receipt" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Choose a receipt");
  },
};
export const ReceiptUploadProgress: Story = {
  render: () => <ReceiptUploadFormView onRefresh={fn()} upload={() => new Promise(() => undefined)} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = setStoryFile(canvasElement);
    await expect(input.files).toHaveLength(1);
    await userEvent.click(canvas.getByRole("button", { name: "Upload receipt" }));
    await expect(canvas.getByRole("button", { name: "Uploading and extracting..." })).toBeDisabled();
  },
};
export const ReceiptUploadSuccess: Story = {
  render: () => <ReceiptUploadFormView onRefresh={fn()} upload={fn(async () => ({ ok: true, status: "review_ready" }))} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    setStoryFile(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Upload receipt" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("uploaded and extracted");
  },
};
export const ReceiptUploadFailure: Story = {
  render: () => <ReceiptUploadFormView onRefresh={fn()} upload={fn(async () => ({ ok: false, error: "Unsupported receipt file type." }))} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    setStoryFile(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Upload receipt" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Unsupported receipt");
  },
};
export const RetryExtraction: Story = {
  render: () => <RetryExtractionButtonView onRefresh={fn()} retry={fn(async () => true)} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Retry extraction" }));
  },
};
export const RetryExtractionFailure: Story = {
  render: () => <RetryExtractionButtonView onRefresh={fn()} retry={fn(async () => false)} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Retry extraction" }));
    await expect(canvas.getByText("Unable to retry extraction.")).toBeVisible();
  },
};
