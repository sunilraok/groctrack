import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test as base, expect, type Page } from "@playwright/test";

export interface TestAccount {
  id: string;
  email: string;
  password: string;
  displayName: string;
}

interface UserFactory {
  admin: SupabaseClient;
  create(label?: string): Promise<TestAccount>;
  uniqueEmail(label?: string): string;
}

export const test = base.extend<{ users: UserFactory }>({
  users: async ({}, provide, testInfo) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error("Run E2E through npm run test:e2e so local Supabase credentials are exported.");
    }
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const createdIds: string[] = [];
    const prefix = `${testInfo.project.name}-${testInfo.workerIndex}-${randomUUID()}`;
    const factory: UserFactory = {
      admin,
      uniqueEmail(label = "user") {
        return `${label}-${prefix}@example.test`;
      },
      async create(label = "user") {
        const email = this.uniqueEmail(label);
        const password = `GrocTrack-${randomUUID()}!`;
        const displayName = `${label} ${testInfo.workerIndex}`;
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: displayName },
        });
        if (error || !data.user) throw new Error(error?.message ?? "Unable to create E2E user.");
        createdIds.push(data.user.id);
        return { id: data.user.id, email, password, displayName };
      },
    };
    await provide(factory);
    const { data: remaining } = await admin.auth.admin.listUsers();
    for (const user of remaining.users.filter((candidate) => candidate.email?.includes(prefix))) {
      if (!createdIds.includes(user.id)) createdIds.push(user.id);
    }
    if (createdIds.length > 0) {
      const { error } = await admin.from("households").delete().in("created_by", createdIds);
      if (error) throw new Error(`Unable to clean up E2E households: ${error.message}`);
    }
    for (const id of createdIds.reverse()) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(`Unable to clean up E2E user ${id}: ${error.message}`);
    }
  },
});

export { expect };

export async function signIn(page: Page, account: TestAccount, next = "/dashboard") {
  await page.goto(`/auth?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname === next || url.pathname === "/dashboard/onboarding");
}

export async function createHousehold(page: Page, name: string) {
  await expect(page).toHaveURL(/\/dashboard\/onboarding$/);
  await page.getByLabel("Household name").fill(name);
  await page.getByRole("button", { name: "Create household" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Kitchen inventory" })).toBeVisible();
}
