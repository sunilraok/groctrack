import { requireHousehold } from "@/lib/households";
import { InvitationForm } from "../forms";

export default async function SettingsPage() {
  const { current, supabase } = await requireHousehold();
  const { data: members, error } = await supabase
    .from("household_members")
    .select("user_id, role, joined_at, profiles(display_name)")
    .eq("household_id", current.household_id)
    .order("joined_at");
  if (error) throw new Error(error.message);

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>{current.households.name}</h1>
          <p>Manage who shares this kitchen inventory.</p>
        </div>
      </header>
      <div className="dashboard-grid">
        <section className="card panel">
          <div className="panel-heading"><h2>Members</h2></div>
          <div className="inventory-list">
            {(members ?? []).map((member) => {
              const profile = member.profiles as unknown as { display_name: string | null } | null;
              return (
                <div className="inventory-row" key={member.user_id}>
                  <div className="item-name">{profile?.display_name || "Household member"}</div>
                  <span className="badge good">{member.role}</span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="card panel">
          <div className="panel-heading"><h2>Invite someone</h2></div>
          {current.role === "owner" ? (
            <>
              <p className="item-meta">Invitation links expire after seven days.</p>
              <InvitationForm />
            </>
          ) : (
            <p className="notice">Only the household owner can create invitations.</p>
          )}
        </section>
      </div>
    </main>
  );
}
