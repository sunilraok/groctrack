import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, expect, signIn, createHousehold } from "./fixtures";

test("onboarding, household switching, inventory validation, idempotency, history, reversal, and sign out", async ({ page, users }) => {
  const account = await users.create("inventory");
  await signIn(page, account);
  await createHousehold(page, "Inventory home");
  const { data: firstHousehold, error: firstHouseholdError } = await users.admin
    .from("households")
    .select("id")
    .eq("created_by", account.id)
    .single();
  expect(firstHouseholdError).toBeNull();
  expect(firstHousehold).toBeTruthy();

  const secondHouseholdId = randomUUID();
  const { error: householdError } = await users.admin.from("households").insert({
    id: secondHouseholdId,
    name: "Second home",
    created_by: account.id,
  });
  expect(householdError).toBeNull();
  const { error: membershipError } = await users.admin.from("household_members").insert({
    household_id: secondHouseholdId,
    user_id: account.id,
    role: "owner",
  });
  expect(membershipError).toBeNull();
  await page.reload();
  await page.getByLabel("Household").selectOption(secondHouseholdId);
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByLabel("Household")).toHaveValue(secondHouseholdId);
  await expect(page.locator("main .eyebrow")).toHaveText("Second home");
  await page.getByLabel("Household").selectOption(firstHousehold!.id);
  await page.getByRole("button", { name: "Switch" }).click();
  await expect(page.getByLabel("Household")).toHaveValue(firstHousehold!.id);
  await expect(page.locator("main .eyebrow")).toHaveText("Inventory home");

  await expect(page.getByText("Your inventory is empty")).toBeVisible();
  await page.getByLabel("Grocery name").fill("Brown rice");
  await page.getByLabel("Category").fill("Pantry");
  await page.getByLabel("Tracked as").selectOption("mass");
  await page.getByLabel("Low-stock threshold").fill("500");
  await page.getByRole("button", { name: "Add grocery" }).click();
  await expect(page.getByRole("link", { name: /Brown rice/ })).toBeVisible();

  await page.getByRole("link", { name: /Brown rice/ }).click();
  await expect(page.getByText("No inventory changes yet.")).toBeVisible();
  await page.getByLabel("Quantity").fill("0");
  await page.getByRole("button", { name: "Record change" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("non-zero quantity");

  await page.getByLabel("Quantity").fill("1000000000000");
  await page.getByRole("button", { name: "Record change" }).click();
  await expect(page.getByLabel("Quantity")).toHaveJSProperty("validity.valid", false);

  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Unit").evaluate((select) => {
    const option = document.createElement("option");
    option.value = "ml";
    option.text = "ml";
    select.append(option);
    (select as HTMLSelectElement).value = "ml";
  });
  await page.getByRole("button", { name: "Record change" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("not compatible");

  await page.getByLabel("Change type").selectOption("adjustment");
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Unit").selectOption("kg");
  await page.getByLabel("Note").fill("Initial stock");
  const operationId = randomUUID();
  await page.locator('input[name="operationId"]').evaluate((input, value) => {
    (input as HTMLInputElement).value = value;
  }, operationId);
  const recordButton = page.getByRole("button", { name: "Record change" });
  await recordButton.click();
  await expect(page.getByRole("button", { name: "Recording..." })).toBeVisible();
  await expect(recordButton).toBeVisible();
  await expect(page.getByText("+1 kg")).toBeVisible();
  await page.locator('input[name="operationId"]').evaluate((input, value) => {
    (input as HTMLInputElement).value = value;
  }, operationId);
  await recordButton.click();
  await expect(page.getByRole("button", { name: "Recording..." })).toBeVisible();
  await expect(recordButton).toBeVisible();
  const { count } = await users.admin
    .from("inventory_transactions")
    .select("id", { count: "exact", head: true })
    .eq("operation_id", operationId);
  expect(count).toBe(1);
  await expect(page.locator('input[name="operationId"]')).toHaveValue("");

  await page.getByLabel("Change type").selectOption("consumption");
  await page.getByLabel("Quantity").fill("-1");
  await page.getByRole("button", { name: "Record change" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("positive amount");

  await page.getByLabel("Quantity").fill("600");
  await page.getByLabel("Unit").selectOption("g");
  await page.getByRole("button", { name: "Record change" }).click();
  await expect(page.getByText("-600 g")).toBeVisible();
  await expect(page.getByText("Low stock")).toBeVisible();

  await page.getByRole("button", { name: "Reverse" }).last().click();
  await expect(page.getByText("+600 g")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");
});

test("@mobile covers onboarding, inventory, item history, settings, and receipts navigation", async ({ page, users }) => {
  const account = await users.create("mobile");
  await signIn(page, account);
  await createHousehold(page, "Mobile home");
  await page.getByLabel("Grocery name").fill("Apples");
  await page.getByLabel("Tracked as").selectOption("count");
  await page.getByRole("button", { name: "Add grocery" }).click();
  await page.getByRole("link", { name: /Apples/ }).click();
  await expect(page.getByRole("heading", { name: "Apples" })).toBeVisible();
  await page.getByRole("link", { name: "Household", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mobile home" })).toBeVisible();
  await page.getByRole("link", { name: "Receipts" }).click();
  await expect(page.getByRole("heading", { name: "Receipts", exact: true })).toBeVisible();
  await page.goto("/invite/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ");
  await expect(page.getByRole("heading", { name: "Join this household?" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
