import { test, expect, signIn, createHousehold } from "./fixtures";

test("invitation acceptance, owner/member views, removal, and revoked denial", async ({ browser, page, users }) => {
  const owner = await users.create("owner");
  const invited = await users.create("invited");
  await signIn(page, owner);
  await createHousehold(page, "Shared home");
  await page.getByRole("link", { name: "Household", exact: true }).click();
  await page.getByLabel("Member email").fill(invited.email);
  await page.getByRole("button", { name: "Create seven-day invitation" }).click();
  const invitationUrl = await page.getByLabel("Share this private invitation link").inputValue();

  const invitedContext = await browser.newContext();
  const invitedPage = await invitedContext.newPage();
  await signIn(invitedPage, invited, new URL(invitationUrl).pathname);
  await expect(invitedPage.getByRole("heading", { name: "Join this household?" })).toBeVisible();
  await invitedPage.getByRole("button", { name: "Accept invitation" }).click();
  await expect(invitedPage).toHaveURL(/\/dashboard$/);
  await invitedPage.goto(invitationUrl);
  await invitedPage.getByRole("button", { name: "Accept invitation" }).click();
  await expect(invitedPage.locator("main").getByRole("alert")).toBeVisible();
  await invitedPage.goto("/dashboard/settings");
  await expect(invitedPage.getByText("Only household owners can create invitations.")).toBeVisible();

  await page.reload();
  await expect(page.getByText(invited.displayName)).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(invited.displayName)).not.toBeVisible();

  await invitedPage.goto("/dashboard");
  await expect(invitedPage).toHaveURL(/\/dashboard\/onboarding$/);
  await invitedContext.close();
});
