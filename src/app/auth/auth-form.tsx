"use client";

import { useActionState, useState } from "react";
import { AuthFeedbackView, AuthFormView } from "@/components/form-views";
import { signIn, signUp, type AuthState } from "./actions";

const initialState: AuthState = {};

export function AuthFeedback({ state }: { state: AuthState }) {
  return <AuthFeedbackView {...state} />;
}

export function AuthForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [state, action, pending] = useActionState(
    mode === "sign-in" ? signIn : signUp,
    initialState,
  );

  return <AuthFormView action={action} mode={mode} next={next} onModeChange={setMode} pending={pending} state={state} />;
}
