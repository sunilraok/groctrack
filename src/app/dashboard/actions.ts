"use server";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  canRemoveMember,
  selectHousehold,
} from "@/lib/household-access";
import { householdCookie, requireHousehold } from "@/lib/households";
import { getServerEnv } from "@/lib/env";
import { getErrorMessage, type ActionResult } from "@/lib/result";
import type { HouseholdMembership } from "@/types/database";
import {
  baseUnitByDimension,
  isInventoryUnit,
  unitDefinitions,
} from "@/lib/units";

export type FormState<T = undefined> = ActionResult<T> | null;

const unsignedDecimal = /^\d{1,12}(?:\.\d{1,6})?$/;
const signedDecimal = /^-?\d{1,12}(?:\.\d{1,6})?$/;

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function createHousehold(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = z
    .object({ name: z.string().trim().min(1).max(80) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Enter a household name." };

  const { supabase } = await requireUser();
  try {
    const { data, error } = await supabase.rpc("create_household", {
      household_name: parsed.data.name,
    });
    if (error) throw error;
    (await cookies()).set(householdCookie, data as string, cookieOptions);
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
  redirect("/dashboard");
}

export async function switchHousehold(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = z
    .object({ householdId: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Choose a valid household." };

  const { supabase, user } = await requireUser();
  try {
    const { data, error } = await supabase
      .from("household_members")
      .select("household_id, user_id, role, joined_at, households(*)")
      .eq("user_id", user.id);
    if (error) throw error;

    const memberships = (data ?? []) as unknown as HouseholdMembership[];
    const selected = selectHousehold(
      memberships,
      parsed.data.householdId,
    );
    if (!selected || selected.household_id !== parsed.data.householdId) {
      return { ok: false, error: "You are not a member of that household." };
    }

    (await cookies()).set(householdCookie, selected.household_id, cookieOptions);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

const grocerySchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80),
  dimension: z.enum(["mass", "volume", "count"]),
  lowStockThreshold: z
    .string()
    .trim()
    .refine((value) => value === "" || unsignedDecimal.test(value)),
});

export async function createGrocery(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = grocerySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the grocery name, unit type, and low-stock threshold.",
    };
  }

  try {
    const { supabase, user, current } = await requireHousehold();
    const normalizedName = parsed.data.name
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .replace(/\s+/g, " ");
    const { error } = await supabase.from("grocery_items").insert({
      household_id: current.household_id,
      name: parsed.data.name,
      normalized_name: normalizedName,
      category: parsed.data.category || null,
      unit_dimension: parsed.data.dimension,
      base_unit: baseUnitByDimension[parsed.data.dimension],
      low_stock_threshold: parsed.data.lowStockThreshold || null,
      created_by: user.id,
    });
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "That grocery already exists." };
      }
      throw error;
    }
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

const inventoryChangeSchema = z.object({
  groceryItemId: z.string().uuid(),
  type: z.enum(["consumption", "adjustment"]),
  quantity: z.string().trim().refine((value) => signedDecimal.test(value)),
  unit: z.string(),
  note: z.string().trim().max(250),
});

export async function recordInventoryChange(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = inventoryChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.quantity === "0") {
    return { ok: false, error: "Enter a valid non-zero quantity and unit." };
  }
  if (!isInventoryUnit(parsed.data.unit)) {
    return { ok: false, error: "Enter a valid inventory unit." };
  }
  if (
    parsed.data.type === "consumption" &&
    parsed.data.quantity.startsWith("-")
  ) {
    return { ok: false, error: "Consumption must be a positive amount." };
  }

  try {
    const { supabase, current } = await requireHousehold();
    const { data: item, error: itemError } = await supabase
      .from("grocery_items")
      .select("unit_dimension")
      .eq("id", parsed.data.groceryItemId)
      .eq("household_id", current.household_id)
      .single();
    if (itemError) throw itemError;
    if (unitDefinitions[parsed.data.unit].dimension !== item.unit_dimension) {
      return { ok: false, error: "That unit is not compatible with this item." };
    }

    const { error } = await supabase.rpc("record_inventory_change", {
      target_grocery_item_id: parsed.data.groceryItemId,
      change_type: parsed.data.type,
      entered_quantity: parsed.data.quantity,
      entered_unit: parsed.data.unit,
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

export async function reverseInventoryTransaction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = z
    .object({
      transactionId: z.string().uuid(),
      groceryItemId: z.string().uuid(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Choose a valid transaction." };
  }

  try {
    const { supabase, current } = await requireHousehold();
    const { data: transaction, error: lookupError } = await supabase
      .from("inventory_transactions")
      .select("id")
      .eq("id", parsed.data.transactionId)
      .eq("grocery_item_id", parsed.data.groceryItemId)
      .eq("household_id", current.household_id)
      .single();
    if (lookupError) throw lookupError;

    const { error } = await supabase.rpc("reverse_inventory_transaction", {
      target_transaction_id: transaction.id,
      reversal_note: "Reversed by household member",
    });
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "That transaction was already reversed." };
      }
      throw error;
    }
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
    .object({ email: z.string().trim().email() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Enter a valid email." };

  const { supabase, user, current } = await requireHousehold();
  if (current.role !== "owner") {
    return { ok: false, error: "Only household owners can invite members." };
  }

  try {
    const email = parsed.data.email.toLowerCase();
    const { error: cleanupError } = await supabase
      .from("household_invitations")
      .delete()
      .eq("household_id", current.household_id)
      .eq("email", email)
      .is("accepted_at", null)
      .lt("expires_at", new Date().toISOString());
    if (cleanupError) throw cleanupError;

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { error } = await supabase.from("household_invitations").insert({
      household_id: current.household_id,
      email,
      token_hash: tokenHash,
      role: "member",
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
    });
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: "An active invitation already exists for that email.",
        };
      }
      throw error;
    }

    const invitationUrl = new URL(
      `/invite/${token}`,
      getServerEnv().NEXT_PUBLIC_SITE_URL,
    );
    return { ok: true, data: { invitationUrl: invitationUrl.toString() } };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}

export async function acceptInvitation(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = z
    .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "This invitation link is invalid." };

  const { supabase } = await requireUser(`/invite/${parsed.data.token}`);
  try {
    const { data, error } = await supabase.rpc("accept_household_invitation", {
      invitation_token: parsed.data.token,
    });
    if (error) throw error;
    (await cookies()).set(householdCookie, data as string, cookieOptions);
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
  redirect("/dashboard");
}

export async function removeHouseholdMember(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = z
    .object({ userId: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Choose a valid member." };

  const { supabase, current } = await requireHousehold();
  if (!canRemoveMember(current, parsed.data.userId)) {
    return {
      ok: false,
      error:
        current.role !== "owner"
          ? "Only household owners can remove members."
          : "Owners cannot remove themselves.",
    };
  }

  try {
    const { error } = await supabase.rpc("revoke_household_member", {
      target_household_id: current.household_id,
      target_user_id: parsed.data.userId,
    });
    if (error) throw error;
    revalidatePath("/dashboard/settings");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) };
  }
}
