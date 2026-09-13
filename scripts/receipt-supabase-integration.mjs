import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_URL ??
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;

assert(url, "Supabase URL is required");
assert(anonKey, "Supabase anon key is required");
assert(serviceRoleKey, "Supabase service role key is required");

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const email = `receipt-${randomUUID()}@example.test`;
const password = `T3st-${randomUUID()}!`;
let userId;
let householdId;
let objectPath;

try {
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  assert.ifError(createError);
  assert(created.user);
  userId = created.user.id;

  householdId = randomUUID();
  const { error: householdError } = await admin.from("households").insert({
    id: householdId,
    name: "Receipt integration household",
    created_by: userId,
  });
  assert.ifError(householdError);
  const { error: membershipError } = await admin
    .from("household_members")
    .insert({
      household_id: householdId,
      user_id: userId,
      role: "owner",
    });
  assert.ifError(membershipError);

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  assert.ifError(signInError);

  const uploadId = randomUUID();
  objectPath = `${householdId}/${userId}/${uploadId}.png`;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = () =>
    client.storage.from("receipts").upload(objectPath, png, {
      contentType: "image/png",
      upsert: false,
    });
  const uploadResults = await Promise.all([upload(), upload()]);
  assert.equal(
    uploadResults.filter(({ error }) => !error).length,
    1,
    "exactly one concurrent object upload must win",
  );

  const { data: ownsObject, error: ownerError } = await client.rpc(
    "owns_receipt_object",
    { object_name: objectPath },
  );
  assert.ifError(ownerError);
  assert.equal(ownsObject, true);

  const receipt = {
    household_id: householdId,
    uploaded_by: userId,
    upload_id: uploadId,
    image_path: objectPath,
    original_filename: "receipt.png",
    content_type: "image/png",
    object_size: png.byteLength,
    content_sha256: createHash("sha256").update(png).digest("hex"),
    status: "pending",
  };
  const registrationResults = await Promise.all([
    admin.from("receipts").insert(receipt),
    admin.from("receipts").insert(receipt),
  ]);
  assert.equal(
    registrationResults.filter(({ error }) => !error).length,
    1,
    "exactly one concurrent receipt registration must win",
  );
  assert.equal(
    registrationResults.filter(({ error }) => error?.code === "23505").length,
    1,
    "the losing registration must fail on uniqueness",
  );

  const { count: receiptCount, error: countError } = await admin
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .eq("uploaded_by", userId)
    .eq("upload_id", uploadId);
  assert.ifError(countError);
  assert.equal(receiptCount, 1);

  const { data: signedBefore, error: signedBeforeError } = await client.storage
    .from("receipts")
    .createSignedUrl(objectPath, 60);
  assert.ifError(signedBeforeError);
  assert(signedBefore?.signedUrl);

  const { error: revokeError } = await admin
    .from("household_members")
    .update({ revoked_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .eq("user_id", userId);
  assert.ifError(revokeError);

  const { data: signedAfter, error: signedAfterError } = await client.storage
    .from("receipts")
    .createSignedUrl(objectPath, 60);
  assert(signedAfterError, "revoked membership must prevent signed URL creation");
  assert.equal(signedAfter, null);

  const { data: retainedObjects, error: retainedError } = await admin.storage
    .from("receipts")
    .list(`${householdId}/${userId}`, { search: `${uploadId}.png` });
  assert.ifError(retainedError);
  assert.equal(retainedObjects?.length, 1, "registration races retain the object");
} finally {
  if (objectPath) {
    await admin.storage.from("receipts").remove([objectPath]);
  }
  if (householdId) {
    await admin.from("households").delete().eq("id", householdId);
  }
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }
}
