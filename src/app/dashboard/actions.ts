"use server";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeReceiptAlias } from "@/lib/aliases";
import { getServerEnv } from "@/lib/env";
import { requireHousehold, householdCookie } from "@/lib/households";
import { getErrorMessage, type ActionResult } from "@/lib/result";
import {
  baseUnitByDimension,
  isInventoryUnit,
  toBaseQuantity,
  unitDefinitions,
} from "@/lib/units";
import { requireUser } from "@/lib/auth";

export type FormState<T = undefined> = ActionResult<T> | null;

export async function createHousehold(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = z
    .object({ name: z.string().trim().min(1).max(80) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Enter a household name." };

  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("create_household", {
      household_name: parsed.data.name,
    });
    if (error) throw error;
    const cookieStore = await cookies();
    cookieStore.set(householdCookie, data as string, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
  redirect("/dashboard");
}

export async function switchHousehold(formData: FormData) {
  const householdId = z.string().uuid().parse(formData.get("householdId"));
  const { memberships } = await requireUser().then(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id);
    if (error) throw error;
    return { memberships: data ?? [] };
  });

  if (!memberships.some((entry) => entry.household_id === householdId)) {
    throw new Error("You are not a member of that household.");
  }

  const cookieStore = await cookies();
  cookieStore.set(householdCookie, householdId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  revalidatePath("/dashboard", "layout");
}

const grocerySchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80).optional(),
  dimension: z.enum(["mass", "volume", "count"]),
  lowStockThreshold: z.coerce.number().nonnegative().optional(),
});

export async function createGrocery(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = {
    ...Object.fromEntries(formData),
    lowStockThreshold: formData.get("lowStockThreshold") || undefined,
  };
  const parsed = grocerySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Check the grocery name, unit type, and threshold." };
  }

  try {
    const { supabase, user, current } = await requireHousehold();
    const { error } = await supabase.from("grocery_items").insert({
      household_id: current.household_id,
      name: parsed.data.name,
      normalized_name: normalizeReceiptAlias(parsed.data.name),
      category: parsed.data.category || null,
      unit_dimension: parsed.data.dimension,
      base_unit: baseUnitByDimension[parsed.data.dimension],
      low_stock_threshold: parsed.data.lowStockThreshold ?? null,
      created_by: user.id,
    });
    if (error) throw error;
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

const inventoryChangeSchema = z.object({
  groceryItemId: z.string().uuid(),
  type: z.enum(["consumption", "adjustment"]),
  direction: z.enum(["add", "remove"]),
  quantity: z.coerce.number().positive(),
  unit: z.string(),
  note: z.string().trim().max(250).optional(),
});

export async function recordInventoryChange(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = inventoryChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid quantity and unit." };
  }
  const unit = parsed.data.unit;
  if (!isInventoryUnit(unit)) {
    return { ok: false, error: "Enter a valid quantity and unit." };
  }

  try {
    const { supabase, current } = await requireHousehold();
    const { data: item, error: itemError } = await supabase
      .from("grocery_items")
      .select("id, unit_dimension")
      .eq("id", parsed.data.groceryItemId)
      .eq("household_id", current.household_id)
      .single();
    if (itemError) throw itemError;

    if (unitDefinitions[unit].dimension !== item.unit_dimension) {
      return { ok: false, error: "That unit is not compatible with this item." };
    }

    let baseQuantity = toBaseQuantity(parsed.data.quantity, unit);
    if (parsed.data.type === "consumption" || parsed.data.direction === "remove") {
      baseQuantity = baseQuantity.negated();
    }

    const { error } = await supabase.rpc("record_inventory_change", {
      target_grocery_item_id: parsed.data.groceryItemId,
      change_type: parsed.data.type,
      base_quantity: baseQuantity.toString(),
      entered_quantity: parsed.data.quantity,
      entered_unit: unit,
      change_note: parsed.data.note || null,
    });
    if (error) throw error;
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/items/${parsed.data.groceryItemId}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

export async function createInvitation(
  _state: FormState<{ invitationUrl: string }>,
  formData: FormData,
): Promise<FormState<{ invitationUrl: string }>> {
  const parsed = z
    .object({ email: z.string().email() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Enter a valid email." };

  try {
    const { supabase, user, current } = await requireHousehold();
    if (current.role !== "owner") {
      return { ok: false, error: "Only household owners can invite members." };
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { error } = await supabase.from("household_invitations").insert({
      household_id: current.household_id,
      email: parsed.data.email.toLowerCase(),
      token_hash: tokenHash,
      role: "member",
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw error;
    const { NEXT_PUBLIC_SITE_URL } = getServerEnv();
    return {
      ok: true,
      data: { invitationUrl: `${NEXT_PUBLIC_SITE_URL}/invite/${token}` },
    };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}
