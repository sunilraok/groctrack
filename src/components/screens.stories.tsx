import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type {
  HouseholdMember,
  HouseholdMembership,
  InventoryStockItem,
  InventoryTransaction,
  Receipt,
} from "@/types/database";
import {
  AuthScreen,
  DashboardShell,
  HomeScreen,
  InventoryItemScreen,
  InventoryScreen,
  InvitationScreen,
  OnboardingScreen,
  ReceiptsScreen,
  SettingsScreen,
} from "./screens";

const meta = {
  title: "Screens/Current routes",
  component: HomeScreen,
  tags: ["autodocs"],
} satisfies Meta<typeof HomeScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const action = fn();

function MockForm({
  kind,
  pending = false,
  error,
  success,
}: {
  kind: "auth" | "household" | "grocery" | "inventory" | "invite" | "upload";
  pending?: boolean;
  error?: string;
  success?: string;
}) {
  const labels = {
    auth: ["Email", "Password"],
    household: ["Household name"],
    grocery: ["Grocery name", "Category"],
    inventory: ["Quantity", "Note"],
    invite: ["Member email"],
    upload: ["Receipt image or PDF"],
  }[kind];
  const button = {
    auth: "Sign in",
    household: "Create household",
    grocery: "Add grocery",
    inventory: "Record change",
    invite: "Create seven-day invitation",
    upload: "Upload receipt",
  }[kind];
  return (
    <form
      className={kind === "grocery" || kind === "inventory" ? "form-grid" : "stack"}
      onSubmit={(event) => {
        event.preventDefault();
        action();
      }}
    >
      {labels.map((label) => (
        <label key={label}>
          {label}
          <input
            aria-invalid={Boolean(error)}
            disabled={pending}
            name={label.toLowerCase().replaceAll(" ", "-")}
            type={label === "Password" ? "password" : label.includes("email") || label === "Email" ? "email" : "text"}
          />
        </label>
      ))}
      {kind === "grocery" && (
        <label>
          Tracked as
          <select defaultValue="mass"><option>mass</option><option>volume</option><option>count</option></select>
        </label>
      )}
      {kind === "inventory" && (
        <label>
          Change type
          <select defaultValue="consumption"><option>consumption</option><option>adjustment</option></select>
        </label>
      )}
      {error && <p className="form-error full" role="alert">{error}</p>}
      {success && <p className="form-success full">{success}</p>}
      <button className="button primary full" disabled={pending}>
        {pending ? "Working..." : button}
      </button>
    </form>
  );
}

const householdId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const baseItem: InventoryStockItem = {
  id: "33333333-3333-4333-8333-333333333333",
  household_id: householdId,
  name: "Brown rice",
  normalized_name: "brown rice",
  category: "Pantry",
  unit_dimension: "mass",
  base_unit: "g",
  low_stock_threshold: "500",
  is_active: true,
  created_by: ownerId,
  created_at: "2026-09-13T12:00:00Z",
  updated_at: "2026-09-13T12:00:00Z",
  quantity_base: "1250",
  balance_updated_at: "2026-09-13T12:00:00Z",
};
const lowItem = { ...baseItem, id: "44444444-4444-4444-8444-444444444444", name: "Coffee", quantity_base: "100" };
const negativeItem = { ...baseItem, id: "55555555-5555-4555-8555-555555555555", name: "Milk", unit_dimension: "volume" as const, base_unit: "ml", quantity_base: "-250" };
const memberships: HouseholdMembership[] = [{
  household_id: householdId,
  user_id: ownerId,
  role: "owner",
  joined_at: "2026-09-13T12:00:00Z",
  households: {
    id: householdId,
    name: "Rao household",
    created_by: ownerId,
    created_at: "2026-09-13T12:00:00Z",
    updated_at: "2026-09-13T12:00:00Z",
  },
}];
const members: HouseholdMember[] = [
  { user_id: ownerId, role: "owner", joined_at: "2026-09-13T12:00:00Z", profiles: { display_name: "Sunil" } },
  { user_id: memberId, role: "member", joined_at: "2026-09-13T12:05:00Z", profiles: { display_name: "Alex" } },
];
let transactionIndex = 0;
const transaction = (overrides: Partial<InventoryTransaction>): InventoryTransaction => ({
  id: `44444444-4444-4444-8444-${String(++transactionIndex).padStart(12, "0")}`,
  household_id: householdId,
  grocery_item_id: baseItem.id,
  transaction_type: "purchase",
  quantity_base: "1000",
  original_quantity: "1",
  original_unit: "kg",
  source_receipt_line_id: null,
  reverses_transaction_id: null,
  operation_id: "66666666-6666-4666-8666-666666666666",
  note: null,
  created_by: ownerId,
  created_at: "2026-09-13T12:00:00Z",
  ...overrides,
});
let receiptIndex = 0;
const receipt = (overrides: Partial<Receipt>): Receipt => ({
  id: `77777777-7777-4777-8777-${String(++receiptIndex).padStart(12, "0")}`,
  household_id: householdId,
  uploaded_by: ownerId,
  upload_id: "88888888-8888-4888-8888-888888888888",
  image_path: `${householdId}/${ownerId}/receipt.png`,
  original_filename: "market.png",
  content_type: "image/png",
  object_size: 2048,
  status: "review_ready",
  merchant_id: null,
  purchased_at: null,
  currency: "USD",
  subtotal: null,
  discount: null,
  tax: null,
  total: null,
  extraction_warnings: [],
  extraction_error: null,
  extraction_error_code: null,
  extraction_retryable: false,
  created_at: "2026-09-13T12:00:00Z",
  merchants: { name: "Local Test Market" },
  ...overrides,
});

const shell = (content: React.ReactNode) => (
  <DashboardShell
    currentId={householdId}
    memberships={memberships}
    signOut={<button className="button ghost small">Sign out</button>}
  >
    {content}
  </DashboardShell>
);

export const Landing: Story = {
  render: () => <HomeScreen />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/auth");
  },
};
export const AuthenticationSignIn: Story = { render: () => <AuthScreen form={<MockForm kind="auth" />} /> };
export const AuthenticationSignUp: Story = { render: () => <AuthScreen form={<MockForm kind="auth" success="Check your email to confirm your account." />} /> };
export const AuthenticationPending: Story = { render: () => <AuthScreen form={<MockForm kind="auth" pending />} /> };
export const AuthenticationValidationError: Story = { render: () => <AuthScreen form={<MockForm kind="auth" error="Enter a valid email and password." />} /> };
export const AuthenticationServerError: Story = { render: () => <AuthScreen form={<MockForm kind="auth" error="Unable to sign in with those credentials." />} /> };
export const AuthenticationExpiredConfirmation: Story = { render: () => <AuthScreen confirmationError form={<MockForm kind="auth" />} /> };
export const InvitationValid: Story = { render: () => <InvitationScreen form={<button className="button primary">Accept invitation</button>} /> };
export const InvitationInvalid: Story = { render: () => <InvitationScreen form={<p className="form-error" role="alert">This invitation link is invalid.</p>} /> };
export const InvitationPending: Story = { render: () => <InvitationScreen form={<button className="button primary" disabled>Joining...</button>} /> };
export const InvitationFailure: Story = { render: () => <InvitationScreen form={<p className="form-error" role="alert">Invitation expired.</p>} /> };
export const HouseholdOnboarding: Story = { render: () => shell(<OnboardingScreen form={<MockForm kind="household" />} />) };
export const HouseholdOnboardingError: Story = { render: () => shell(<OnboardingScreen form={<MockForm error="Enter a household name." kind="household" />} />) };
export const InventoryEmpty: Story = { render: () => shell(<InventoryScreen groceries={[]} groceryForm={<MockForm kind="grocery" />} householdName="Rao household" />) };
export const InventoryPopulated: Story = { render: () => shell(<InventoryScreen groceries={[baseItem, lowItem]} groceryForm={<MockForm kind="grocery" />} householdName="Rao household" />) };
export const InventoryNegativeStock: Story = { render: () => shell(<InventoryScreen groceries={[negativeItem]} groceryForm={<MockForm kind="grocery" />} householdName="Rao household" />) };
export const InventoryLoading: Story = { render: () => shell(<InventoryScreen groceries={[]} groceryForm={<MockForm kind="grocery" pending />} householdName="Rao household" loading />) };
export const InventoryError: Story = { render: () => shell(<InventoryScreen error="Unable to load inventory." groceries={[]} groceryForm={<MockForm kind="grocery" />} householdName="Rao household" />) };
export const GroceryValidationError: Story = { render: () => shell(<InventoryScreen groceries={[]} groceryForm={<MockForm error="Check the grocery name, unit type, and low-stock threshold." kind="grocery" />} householdName="Rao household" />) };
export const GrocerySubmitting: Story = { render: () => shell(<InventoryScreen groceries={[]} groceryForm={<MockForm kind="grocery" pending />} householdName="Rao household" />) };
export const ItemHistoryEmpty: Story = { render: () => shell(<InventoryItemScreen changeForm={<MockForm kind="inventory" />} item={baseItem} reversalFor={() => null} transactions={[]} />) };
export const ItemHistoryAllTypes: Story = {
  render: () => shell(
    <InventoryItemScreen
      changeForm={<MockForm kind="inventory" />}
      item={lowItem}
      reversalFor={() => <button className="button ghost small">Reverse</button>}
      transactions={[
        transaction({ transaction_type: "purchase" }),
        transaction({ transaction_type: "consumption", quantity_base: "-250" }),
        transaction({ transaction_type: "adjustment", quantity_base: "50" }),
        transaction({ transaction_type: "reversal", quantity_base: "-50", reverses_transaction_id: "unused" }),
      ]}
    />,
  ),
};
export const InventoryChangeValidation: Story = { render: () => shell(<InventoryItemScreen changeForm={<MockForm error="Enter a valid non-zero quantity and unit." kind="inventory" />} item={baseItem} reversalFor={() => null} transactions={[]} />) };
export const InventoryChangeSubmitting: Story = { render: () => shell(<InventoryItemScreen changeForm={<MockForm kind="inventory" pending />} item={baseItem} reversalFor={() => null} transactions={[]} />) };
export const SettingsOwner: Story = { render: () => shell(<SettingsScreen currentUserId={ownerId} householdName="Rao household" invitationForm={<MockForm kind="invite" />} members={members} removeMember={() => <button className="button danger small">Remove</button>} role="owner" />) };
export const SettingsMember: Story = { render: () => shell(<SettingsScreen currentUserId={memberId} householdName="Rao household" members={members} removeMember={() => null} role="member" />) };
export const SettingsPendingInvitation: Story = { render: () => shell(<SettingsScreen currentUserId={ownerId} householdName="Rao household" invitationForm={<MockForm kind="invite" success="Invitation link ready." />} members={members} removeMember={() => null} role="owner" />) };
export const SettingsRevokedMember: Story = { render: () => shell(<SettingsScreen currentUserId={ownerId} householdName="Rao household" invitationForm={<MockForm kind="invite" />} members={members.slice(0, 1)} removeMember={() => null} role="owner" />) };
export const SettingsError: Story = { render: () => shell(<SettingsScreen currentUserId={ownerId} error="Unable to load household members." householdName="Rao household" invitationForm={<MockForm kind="invite" />} members={[]} removeMember={() => null} role="owner" />) };
export const ReceiptsEmpty: Story = { render: () => shell(<ReceiptsScreen householdName="Rao household" receipts={[]} retryFor={() => null} uploadForm={<MockForm kind="upload" />} />) };
export const ReceiptsLifecycle: Story = { render: () => shell(<ReceiptsScreen householdName="Rao household" receipts={[receipt({ status: "pending" }), receipt({ status: "processing" }), receipt({ status: "review_ready" }), receipt({ status: "failed", extraction_error: "Temporary extractor failure.", extraction_retryable: true }), receipt({ status: "failed", extraction_error: "Unreadable receipt.", extraction_retryable: false })]} retryFor={(item) => item.extraction_retryable ? <button className="button ghost small">Retry extraction</button> : null} uploadForm={<MockForm kind="upload" />} />) };
export const ReceiptSelectedFile: Story = { render: () => shell(<ReceiptsScreen householdName="Rao household" receipts={[]} retryFor={() => null} uploadForm={<MockForm kind="upload" success="market.png selected." />} />) };
export const ReceiptUploading: Story = { render: () => shell(<ReceiptsScreen householdName="Rao household" receipts={[]} retryFor={() => null} uploadForm={<MockForm kind="upload" pending />} />) };
export const ReceiptUnsupported: Story = { render: () => shell(<ReceiptsScreen householdName="Rao household" receipts={[]} retryFor={() => null} uploadForm={<MockForm error="Unsupported receipt file type." kind="upload" />} />) };
export const ReceiptOversized: Story = { render: () => shell(<ReceiptsScreen householdName="Rao household" receipts={[]} retryFor={() => null} uploadForm={<MockForm error="Receipt files cannot exceed 10 MiB." kind="upload" />} />) };
export const ReceiptDuplicateRetry: Story = { render: () => shell(<ReceiptsScreen householdName="Rao household" receipts={[receipt({ status: "failed", extraction_retryable: true })]} retryFor={() => <button className="button ghost small">Retry extraction</button>} uploadForm={<MockForm success="Receipt uploaded and extracted." kind="upload" />} />) };
export const InteractiveGroceryForm: Story = {
  render: () => shell(<InventoryScreen groceries={[]} groceryForm={<MockForm kind="grocery" />} householdName="Rao household" />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Grocery name"), "Oats");
    await userEvent.selectOptions(canvas.getByLabelText("Tracked as"), "count");
    await userEvent.click(canvas.getByRole("button", { name: "Add grocery" }));
    await expect(action).toHaveBeenCalled();
  },
};
