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
  authenticatedClient(account: TestAccount): Promise<SupabaseClient>;
  create(label?: string): Promise<TestAccount>;
  uniqueEmail(label?: string): string;
}

export const test = base.extend<{ users: UserFactory }>({
  users: async ({}, provide, testInfo) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceKey) {
      throw new Error("Run E2E through npm run test:e2e so local Supabase credentials are exported.");
    }
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const prefix = `${testInfo.project.name}-${testInfo.workerIndex}-${randomUUID()}`;
    const factory: UserFactory = {
      admin,
      async authenticatedClient(account) {
        const client = createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error } = await client.auth.signInWithPassword(account);
        if (error) throw new Error(error.message);
        return client;
      },
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
        return { id: data.user.id, email, password, displayName };
      },
    };
    await provide(factory);
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
