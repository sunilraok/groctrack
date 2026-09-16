import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("landing, authentication, callback safety, and route guards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Shared grocery inventory/ })).toBeVisible();
  await page.getByRole("link", { name: /Sign in or create/ }).click();
  await expect(page).toHaveURL(/\/auth$/);

  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("Password").fill("incorrect-password");
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(/Unable to sign in/);

  await page.goto("/auth/callback?code=invalid&next=https://evil.example");
  await expect(page).toHaveURL(/\/auth\?error=confirmation/);
  expect(new URL(page.url()).searchParams.get("next")).toBe("/dashboard");

  for (const path of [
    "/dashboard",
    "/dashboard/onboarding",
    "/dashboard/settings",
    "/dashboard/receipts",
    "/dashboard/items/33333333-3333-4333-8333-333333333333",
    "/invite/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/auth\?next=/);
  }

  await page.goto("/");
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("sign-up and local email confirmation complete without account enumeration", async ({ page, users }) => {
  const email = users.uniqueEmail("signup");
  const password = `GrocTrack-${randomUUID()}!`;
  await page.goto("/auth");
  await page.getByLabel("Authentication mode").getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Name").fill("Signup user");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).last().click();
  await expect(page.getByText(/check your email/i)).toBeVisible();

  const { data: listed, error: listError } = await users.admin.auth.admin.listUsers();
  expect(listError).toBeNull();
  const created = listed.users.find((user) => user.email === email);
  expect(created).toBeTruthy();
  const { data: confirmation, error: confirmationError } =
    await users.admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { redirectTo: "http://localhost:3000/auth" },
    });
  expect(confirmationError).toBeNull();
    const actionLink = confirmation.properties?.action_link;
    expect(actionLink).toBeTruthy();
    await page.goto(actionLink!);
  await page.waitForURL((url) => url.origin === "http://localhost:3000");
  await page.goto("/auth");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/onboarding$/);
});

test("@mobile renders landing and authentication without critical accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Sign in or create/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: /private grocery workspace/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
