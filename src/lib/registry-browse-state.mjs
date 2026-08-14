const browseStateKeys = ["q", "kind", "intent"];

export function readRegistryBrowseState(url) {
  const params = new URL(url).searchParams;
  return Object.fromEntries(browseStateKeys.map((key) => [key, params.get(key)?.trim() || ""]));
}

export function registryBrowseStateUrl(url, state) {
  const next = new URL(url);
  for (const key of browseStateKeys) {
    const value = String(state[key] || "").trim();
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  }
  return next.href;
}
