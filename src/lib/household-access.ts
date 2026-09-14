import type { HouseholdMembership } from "@/types/database";

export function selectHousehold(
  memberships: HouseholdMembership[],
  requestedId: string | undefined,
) {
  return (
    memberships.find(({ household_id }) => household_id === requestedId) ??
    memberships[0] ??
    null
  );
}

export function canManageHousehold(role: HouseholdMembership["role"]) {
  return role === "owner";
}

export function canRemoveMember(
  actor: HouseholdMembership,
  targetUserId: string,
) {
  return canManageHousehold(actor.role) && actor.user_id !== targetUserId;
}
