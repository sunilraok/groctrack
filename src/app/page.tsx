import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-10 shadow-sm sm:p-14">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
          GrocTrack
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Shared grocery inventory, built on a secure foundation.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
          Create a private household, invite the people you live with, and keep
          everyone working from the same grocery list.
        </p>
        <Link
          className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800"
          href="/auth"
        >
          Sign in or create an account
        </Link>
      </section>
    </main>
  );
}
