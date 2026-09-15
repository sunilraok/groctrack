import { signOut } from "@/app/auth/actions";
import { getHouseholdContext } from "@/lib/households";
import { DashboardShell } from "@/components/screens";
import { HouseholdSwitcher } from "./forms";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { memberships, current } = await getHouseholdContext();
  return (
    <DashboardShell
      currentId={current?.household_id}
      memberships={memberships}
      signOut={
        <form action={signOut}>
          <button className="button ghost small">Sign out</button>
        </form>
      }
      switcher={current ? (
        <HouseholdSwitcher memberships={memberships} currentId={current.household_id} />
      ) : undefined}
    >
      {children}
    </DashboardShell>
  );
}
