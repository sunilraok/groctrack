export function safeNextPath(value: FormDataEntryValue | string | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  try {
    const url = new URL(value, "http://localhost");
    return url.origin === "http://localhost"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
}
