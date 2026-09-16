import { PDFDocument } from "pdf-lib";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { test, expect, signIn, createHousehold } from "./fixtures";

async function imageFixture(format: "jpeg" | "png" | "webp") {
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 16, g: 185, b: 129 },
    },
  })[format]().toBuffer();
}

async function pdfFixture() {
  const document = await PDFDocument.create();
  document.addPage([200, 200]);
  return Buffer.from(await document.save());
}

test("supported receipt uploads, validation, retry recovery, and private image access", async ({ browser, page, users }) => {
  const owner = await users.create("receipt-owner");
  const outsider = await users.create("receipt-outsider");
  const collaborator = await users.create("receipt-member");
  await signIn(page, owner);
  await createHousehold(page, "Receipt home");
  await page.getByRole("link", { name: "Receipts" }).click();
  await expect(page.getByText("No receipts yet")).toBeVisible();

  const fixtures = [
    { name: "receipt.jpg", mimeType: "image/jpeg", buffer: await imageFixture("jpeg") },
    { name: "receipt.png", mimeType: "image/png", buffer: await imageFixture("png") },
    { name: "receipt.webp", mimeType: "image/webp", buffer: await imageFixture("webp") },
    { name: "receipt.pdf", mimeType: "application/pdf", buffer: await pdfFixture() },
  ];
  for (const fixture of fixtures) {
    await page.getByLabel(/Receipt image or PDF/).setInputFiles(fixture);
    await page.getByRole("button", { name: "Upload receipt" }).click();
    await expect(page.getByRole("link", { name: fixture.name })).toBeVisible();
    await expect(page.getByText("Ready for review").first()).toBeVisible();
  }

  const { data: retryReceipt } = await users.admin
    .from("receipts")
    .select("id")
    .eq("uploaded_by", owner.id)
    .eq("original_filename", "receipt.png")
    .single();
  expect(retryReceipt).toBeTruthy();
  const { error: processingSeedError } = await users.admin
    .from("receipts")
    .update({
      status: "processing",
      extraction_run_id: randomUUID(),
      processing_started_at: new Date().toISOString(),
    })
    .eq("id", retryReceipt!.id);
  expect(processingSeedError).toBeNull();
  const { error: retrySeedError } = await users.admin
    .from("receipts")
    .update({
      status: "failed",
      extraction_error: "Temporary extractor failure.",
      extraction_error_code: "temporary",
      extraction_retryable: true,
      extraction_run_id: null,
      processing_started_at: null,
    })
    .eq("id", retryReceipt!.id);
  expect(retrySeedError).toBeNull();
  await page.reload();
  await expect(page.getByText("Temporary extractor failure.")).toBeVisible();
  await page.getByRole("button", { name: "Retry extraction" }).click();
  await expect(page.getByText("Temporary extractor failure.")).not.toBeVisible();
  await expect(page.getByText("Ready for review").first()).toBeVisible();

  await page.getByLabel(/Receipt image or PDF/).setInputFiles({
    name: "malware.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not a receipt"),
  });
  await page.getByRole("button", { name: "Upload receipt" }).click();
  await expect(page.getByRole("status")).toContainText(/Unsupported|receipt/);

  await page.getByLabel(/Receipt image or PDF/).setInputFiles({
    name: "oversized.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await page.getByRole("button", { name: "Upload receipt" }).click();
  await expect(page.getByRole("status")).toContainText("cannot exceed 10 MiB");

  const receiptLink = page.getByRole("link", { name: "receipt.png" });
  const receiptPath = await receiptLink.getAttribute("href");
  expect(receiptPath).toBeTruthy();
  const authorizedResponse = await page.request.get(receiptPath!, { maxRedirects: 0 });
  expect(authorizedResponse.status()).toBe(302);

  const { data: household } = await users.admin
    .from("households")
    .select("id")
    .eq("created_by", owner.id)
    .single();
  expect(household).toBeTruthy();
  const { error: membershipError } = await users.admin.from("household_members").insert({
    household_id: household!.id,
    user_id: collaborator.id,
    role: "member",
  });
  expect(membershipError).toBeNull();
  const collaboratorContext = await browser.newContext();
  const collaboratorPage = await collaboratorContext.newPage();
  await signIn(collaboratorPage, collaborator);
  const memberResponse = await collaboratorPage.request.get(receiptPath!, { maxRedirects: 0 });
  expect(memberResponse.status()).toBe(302);
  const { error: revokeError } = await users.admin
    .from("household_members")
    .update({ revoked_at: new Date().toISOString() })
    .eq("household_id", household!.id)
    .eq("user_id", collaborator.id);
  expect(revokeError).toBeNull();
  const revokedResponse = await collaboratorPage.request.get(receiptPath!, { maxRedirects: 0 });
  expect(revokedResponse.status()).toBe(404);

  await signIn(collaboratorPage, outsider);
  await createHousehold(collaboratorPage, "Other home");
  const deniedResponse = await collaboratorPage.request.get(receiptPath!, { maxRedirects: 0 });
  expect(deniedResponse.status()).toBe(404);
  await collaboratorContext.close();
});
