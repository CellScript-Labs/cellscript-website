export function registryHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048 || value !== value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
