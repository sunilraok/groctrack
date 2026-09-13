import { HouseholdForm } from "../forms";

export default function OnboardingPage() {
  return (
    <main className="page">
      <section className="card modal-card">
        <p className="eyebrow">First things first</p>
        <h1>Create your household</h1>
        <p>Your household data is visible only to people you invite.</p>
        <HouseholdForm />
      </section>
    </main>
  );
}
