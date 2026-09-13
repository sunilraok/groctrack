import Link from "next/link";
import {
  ArrowRight,
  Check,
  PackageOpen,
  ScanLine,
  Sparkles,
  Users,
} from "lucide-react";

const features = [
  {
    icon: ScanLine,
    title: "Scan the receipt",
    copy: "Upload a photo and turn store shorthand into editable grocery lines.",
  },
  {
    icon: Sparkles,
    title: "Teach it once",
    copy: "Confirm that TDL 1KG means tur dal and future receipts remember it.",
  },
  {
    icon: PackageOpen,
    title: "Use what you have",
    copy: "Record consumption in grams, kilograms, liters, or counts.",
  },
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-mark"><ScanLine size={22} /></span>
          GrocTrack
        </Link>
        <Link className="button ghost" href="/auth">Sign in</Link>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Kitchen inventory, without the spreadsheet</p>
          <h1>Your grocery receipt already knows what you bought.</h1>
          <p className="hero-lead">
            GrocTrack turns receipts into a shared household stock list, learns
            the abbreviations your stores use, and keeps every adjustment
            auditable.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/auth">
              Start tracking <ArrowRight size={18} />
            </Link>
            <span className="quiet-note">
              <Check size={16} /> Free-tier friendly
            </span>
          </div>
        </div>
        <div className="receipt-visual" aria-label="Example scanned receipt">
          <div className="receipt-paper">
            <div className="receipt-top">
              <span>FRESH MART</span>
              <span>12 SEP</span>
            </div>
            <div className="receipt-line"><span>TUR DAL 1KG</span><b>$6.40</b></div>
            <div className="receipt-line learned">
              <span>Mapped to <strong>Tur dal</strong></span>
              <Check size={15} />
            </div>
            <div className="receipt-line"><span>BASMATI 2KG</span><b>$8.90</b></div>
            <div className="receipt-line learned">
              <span>Mapped to <strong>Basmati rice</strong></span>
              <Check size={15} />
            </div>
            <div className="receipt-total"><span>Total</span><b>$15.30</b></div>
          </div>
          <div className="stock-chip">
            <PackageOpen size={18} />
            <span><b>+3 kg</b> added to pantry</span>
          </div>
        </div>
      </section>

      <section className="feature-grid">
        {features.map(({ icon: Icon, title, copy }) => (
          <article className="feature" key={title}>
            <Icon size={24} />
            <h2>{title}</h2>
            <p>{copy}</p>
          </article>
        ))}
      </section>

      <section className="household-banner">
        <Users size={28} />
        <div>
          <h2>One pantry. Everyone in sync.</h2>
          <p>Invite household members and share the same live inventory history.</p>
        </div>
      </section>
    </main>
  );
}
