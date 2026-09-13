import Link from "next/link";
import { requireHousehold } from "@/lib/households";

export default async function DashboardPage() {
  const { current, memberships } = await requireHousehold();
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Current household</p>
          <h1>{current.households.name}</h1>
          <p>
            You are a household {current.role}. You belong to{" "}
            {memberships.length} {memberships.length === 1 ? "household" : "households"}.
          </p>
        </div>
        <Link className="button primary" href="/dashboard/settings">
          Manage household
        </Link>
      </header>
      <section className="card panel">
        <h2>Household access is ready</h2>
        <p>
          Invite members from household settings. Inventory and receipt workflows
          will be added in later releases.
        </p>
      </section>
    </main>
  );
}
