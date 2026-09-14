import { requireHousehold } from "@/lib/households";
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
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Household settings</p>
          <h1>{current.households.name}</h1>
          <p>Manage the people who can access this household.</p>
        </div>
      </header>
      <div className="dashboard-grid">
        <section className="card panel">
          <div className="panel-heading"><h2>Members</h2></div>
          <div className="member-list">
            {members.map((member) => (
              <div className="member-row" key={member.user_id}>
                <div>
                  <strong>
                    {member.profiles?.display_name ||
                      (member.user_id === user.id ? "You" : "Household member")}
                  </strong>
                  <span className="badge">{member.role}</span>
                </div>
                {current.role === "owner" && member.user_id !== user.id && (
                  <RemoveMemberForm userId={member.user_id} />
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="card panel">
          <div className="panel-heading"><h2>Invite someone</h2></div>
          {current.role === "owner" ? (
            <>
              <p>Links are tied to the recipient email and expire after seven days.</p>
              <InvitationForm />
            </>
          ) : (
            <p className="notice">Only household owners can create invitations.</p>
          )}
        </section>
      </div>
    </main>
  );
}
