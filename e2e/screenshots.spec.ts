import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { test, expect, signIn, createHousehold } from "./fixtures";

const outputDirectory = path.join(process.cwd(), "docs", "images");

test.use({
  colorScheme: "light",
  locale: "en-US",
  timezoneId: "UTC",
  viewport: { width: 1440, height: 1000 },
});

test.skip(
  process.env.CAPTURE_DOCS_SCREENSHOTS !== "1",
  "Documentation screenshots are generated only by npm run capture:screenshots.",
);

async function capture(page: Parameters<typeof signIn>[0], filename: string) {
  await page.locator("nextjs-portal").evaluateAll((elements) => {
    elements.forEach((element) => element.remove());
  });
  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    path: path.join(outputDirectory, filename),
  });
}

test("capture the product tour", async ({ page, users }) => {
  await mkdir(outputDirectory, { recursive: true });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Shared grocery inventory/ })).toBeVisible();
  await capture(page, "landing.png");

  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: "Share one private grocery workspace." })).toBeVisible();
  await capture(page, "authentication.png");

  const account = await users.create("demo-shopper");
  await signIn(page, account);
  await createHousehold(page, "Maple Street household");

  const { data: household, error: householdError } = await users.admin
    .from("households")
    .select("id")
    .eq("created_by", account.id)
    .single();
  expect(householdError).toBeNull();
  expect(household).toBeTruthy();

  const groceries = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      household_id: household!.id,
      name: "Brown rice",
      normalized_name: "brown rice",
      category: "Pantry",
      unit_dimension: "mass",
      base_unit: "g",
      low_stock_threshold: 500,
      created_by: account.id,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      household_id: household!.id,
      name: "Coffee beans",
      normalized_name: "coffee beans",
      category: "Pantry",
      unit_dimension: "mass",
      base_unit: "g",
      low_stock_threshold: 250,
      created_by: account.id,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      household_id: household!.id,
      name: "Oat milk",
      normalized_name: "oat milk",
      category: "Dairy alternatives",
      unit_dimension: "volume",
      base_unit: "ml",
      low_stock_threshold: 500,
      created_by: account.id,
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      household_id: household!.id,
      name: "Apples",
      normalized_name: "apples",
      category: "Produce",
      unit_dimension: "count",
      base_unit: "each",
      low_stock_threshold: 4,
      created_by: account.id,
    },
  ];
  const { error: groceryError } = await users.admin.from("grocery_items").insert(groceries);
  expect(groceryError).toBeNull();
  const { error: balanceError } = await users.admin.from("inventory_balances").insert([
    { household_id: household!.id, grocery_item_id: groceries[0].id, quantity_base: 2250 },
    { household_id: household!.id, grocery_item_id: groceries[1].id, quantity_base: 180 },
    { household_id: household!.id, grocery_item_id: groceries[2].id, quantity_base: 1500 },
    { household_id: household!.id, grocery_item_id: groceries[3].id, quantity_base: 8 },
  ]);
  expect(balanceError).toBeNull();

  await page.reload();
  await expect(page.getByRole("link", { name: /Coffee beans/ })).toBeVisible();
  await capture(page, "inventory-dashboard.png");

  await page.getByRole("link", { name: "Receipts" }).click();
  const receiptImage = await sharp({
    create: {
      width: 900,
      height: 1200,
      channels: 3,
      background: { r: 250, g: 250, b: 247 },
    },
  })
    .png()
    .toBuffer();
  await page.getByLabel(/Receipt image or PDF/).setInputFiles({
    name: "weekly-market-receipt.png",
    mimeType: "image/png",
    buffer: receiptImage,
  });
  await page.getByRole("button", { name: "Upload receipt" }).click();
  await expect(page.getByText("Receipt uploaded and extracted.")).toBeVisible();
  await expect(page.getByText("Ready for review")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("link", { name: "weekly-market-receipt.png" })).toBeVisible();
  // Keep the generated documentation stable without mutating immutable receipt provenance.
  await page.locator(".receipt-row .item-meta").evaluate((element) => {
    element.textContent = "Local Test Market · Sep 15, 2026, 6:30 PM";
  });
  await capture(page, "receipt-review.png");
});
