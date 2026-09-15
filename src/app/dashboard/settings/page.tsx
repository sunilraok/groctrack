import { requireHousehold } from "@/lib/households";
import { SettingsScreen } from "@/components/screens";
import type { HouseholdMember } from "@/types/database";
import { InvitationForm, RemoveMemberForm } from "../forms";

export default async function SettingsPage() {
  const { current, supabase, user } = await requireHousehold();
  const { data, error } = await supabase
    .from("household_members")
    .select("user_id, role, joined_at, profiles(display_name)")
    .eq("household_id", current.household_id)
    .is("revoked_at", null)
    .order("joined_at");
  if (error) throw new Error(`Unable to load household members: ${error.message}`);

  const members = (data ?? []) as unknown as HouseholdMember[];
  return (
    <SettingsScreen
      currentUserId={user.id}
      householdName={current.households.name}
      invitationForm={<InvitationForm />}
      members={members}
      removeMember={(userId) => <RemoveMemberForm userId={userId} />}
      role={current.role}
    />
  );
}
