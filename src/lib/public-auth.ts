export const genericSignUpMessage =
  "If this address can be registered, check your email for a confirmation link.";

export const genericSignInError =
  "Unable to sign in with those credentials.";

export async function submitSignUpWithoutEnumeration(
  submit: () => Promise<unknown>,
) {
  try {
    await submit();
  } catch {
    // Public callers receive the same response for all provider outcomes.
  }

  return { message: genericSignUpMessage };
}
