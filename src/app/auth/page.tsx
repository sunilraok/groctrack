import Link from "next/link";
import { ScanLine } from "lucide-react";
import { AuthForm } from "./auth-form";

export default function AuthPage() {
  return (
    <main className="auth-page">
      <Link className="brand" href="/">
        <span className="brand-mark"><ScanLine size={22} /></span>
        GrocTrack
      </Link>
      <section className="auth-copy">
        <p className="eyebrow">Your kitchen, accounted for</p>
        <h1>Turn receipts into a stock list.</h1>
        <p>
          Scan groceries, teach GrocTrack your store&apos;s shorthand, and know
          what is on hand before the next shop.
        </p>
      </section>
      <AuthForm />
    </main>
  );
}
