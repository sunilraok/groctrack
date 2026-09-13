export type HouseholdRole = "owner" | "member";

export interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface HouseholdMembership {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  joined_at: string;
  households: Household;
}

export interface HouseholdMember {
  user_id: string;
  role: HouseholdRole;
  joined_at: string;
  profiles: { display_name: string | null } | null;
}
