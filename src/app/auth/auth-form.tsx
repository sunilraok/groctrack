"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

const initialState: AuthState = {};

export function AuthForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [state, action, pending] = useActionState(
    mode === "sign-in" ? signIn : signUp,
    initialState,
  );

  return (
    <section className="card auth-card">
      <div className="segmented" aria-label="Authentication mode">
        <button
          className={mode === "sign-in" ? "active" : ""}
          onClick={() => setMode("sign-in")}
          type="button"
        >
          Sign in
        </button>
        <button
          className={mode === "sign-up" ? "active" : ""}
          onClick={() => setMode("sign-up")}
          type="button"
        >
          Create account
        </button>
      </div>
      <form action={action} className="stack">
        <input name="next" type="hidden" value={next} />
        {mode === "sign-up" && (
          <label>
            Name
            <input name="displayName" autoComplete="name" required />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            minLength={8}
            maxLength={128}
            required
          />
        </label>
        {state.error && <p className="form-error" role="alert">{state.error}</p>}
        {state.message && <p className="form-success">{state.message}</p>}
        <button className="button primary" disabled={pending}>
          {pending ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </section>
  );
}
