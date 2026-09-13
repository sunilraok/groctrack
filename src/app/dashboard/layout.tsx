import Link from "next/link";
import {
  History,
  House,
  PackageOpen,
  ReceiptText,
  ScanLine,
  Settings,
} from "lucide-react";
import { getHouseholdContext } from "@/lib/households";
import { signOut } from "@/app/auth/actions";
import { switchHousehold } from "./actions";

const navigation = [
  { href: "/dashboard", label: "Inventory", icon: PackageOpen },
  { href: "/dashboard/receipts", label: "Receipts", icon: ReceiptText },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/settings", label: "Household", icon: Settings },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { memberships, current } = await getHouseholdContext();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark"><ScanLine size={22} /></span>
          GrocTrack
        </Link>
        {current && (
          <form action={switchHousehold} className="household-select">
            <label>
              Household
              <select
                name="householdId"
                defaultValue={current.household_id}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
              >
                {memberships.map((membership) => (
                  <option key={membership.household_id} value={membership.household_id}>
                    {membership.households.name}
                  </option>
                ))}
              </select>
            </label>
          </form>
        )}
        <nav className="side-nav" aria-label="Primary navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href}><Icon size={19} /> {label}</Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <form action={signOut}>
            <button className="button ghost small">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="app-main">
        <header className="mobile-header">
          <Link className="brand" href="/dashboard">
            <span className="brand-mark"><ScanLine size={20} /></span>
            GrocTrack
          </Link>
          <Link className="button ghost small" href="/dashboard/settings">
            <House size={17} />
          </Link>
        </header>
        {children}
      </div>
    </div>
  );
}
