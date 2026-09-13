import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getHouseholdContext } from "@/lib/households";
import { HouseholdSwitcher } from "./forms";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { memberships, current } = await getHouseholdContext();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">GrocTrack</Link>
        {current && (
          <HouseholdSwitcher
            memberships={memberships}
            currentId={current.household_id}
          />
        )}
        <nav className="side-nav" aria-label="Primary navigation">
          <Link href="/dashboard">Overview</Link>
          {current && <Link href="/dashboard/settings">Household</Link>}
        </nav>
        <form action={signOut} className="sidebar-footer">
          <button className="button ghost small">Sign out</button>
        </form>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}
