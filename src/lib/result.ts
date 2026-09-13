export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred";
}
