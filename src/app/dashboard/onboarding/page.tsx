import { HouseholdForm } from "../forms";
import { OnboardingScreen } from "@/components/screens";

export default function OnboardingPage() {
  return <OnboardingScreen form={<HouseholdForm />} />;
}
