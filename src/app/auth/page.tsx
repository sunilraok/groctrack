import { safeNextPath } from "@/lib/navigation";
import { AuthScreen } from "@/components/screens";
import { AuthForm } from "./auth-form";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next ?? null);

  return (
    <AuthScreen
      confirmationError={params.error === "confirmation"}
      form={<AuthForm next={next} />}
    />
  );
}
