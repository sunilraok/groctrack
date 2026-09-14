import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { selectHousehold } from "@/lib/household-access";
import type { HouseholdMembership } from "@/types/database";
import { requireUser } from "@/lib/auth";

export const householdCookie = "groctrack-household";

export async function getHouseholdContext() {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, user_id, role, joined_at, households(*)")
    .eq("user_id", user.id)
    .order("joined_at");

  if (error) {
    throw new Error(`Unable to load households: ${error.message}`);
  }

  const memberships = (data ?? []) as unknown as HouseholdMembership[];
  const cookieStore = await cookies();
  const current = selectHousehold(
    memberships,
    cookieStore.get(householdCookie)?.value,
  );

  return { supabase, user, memberships, current };
}

export async function requireHousehold() {
  const context = await getHouseholdContext();
  if (!context.current) {
    redirect("/dashboard/onboarding");
  }
  return { ...context, current: context.current };
}
