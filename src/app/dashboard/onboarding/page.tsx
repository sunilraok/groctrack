import { HouseholdForm } from "../forms";

export default function OnboardingPage() {
  return (
    <main className="page">
      <section className="card modal-card">
        <p className="eyebrow">First things first</p>
        <h1>Create your household</h1>
        <p>
          Groceries, receipts, and learned aliases are private to the people
          you invite.
        </p>
        <HouseholdForm />
      </section>
    </main>
  );
}
