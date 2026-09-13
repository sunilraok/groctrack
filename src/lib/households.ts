import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { HouseholdMembership } from "@/types/database";
import { requireUser } from "@/lib/auth";

const householdCookie = "groctrack-household";

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
  if (memberships.length === 0) {
    return { supabase, user, memberships, current: null };
  }

  const cookieStore = await cookies();
  const selectedId = cookieStore.get(householdCookie)?.value;
  const current =
    memberships.find((membership) => membership.household_id === selectedId) ??
    memberships[0];

  return { supabase, user, memberships, current };
}

export async function requireHousehold() {
  const context = await getHouseholdContext();
  if (!context.current) {
    redirect("/dashboard/onboarding");
  }
  return { ...context, current: context.current };
}

export { householdCookie };
