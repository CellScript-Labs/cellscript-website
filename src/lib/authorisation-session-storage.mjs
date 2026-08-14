const SESSION_ID_PATTERN = /^auth_[0-9a-f]{32}$/;
const BROWSER_TOKEN_PATTERN = /^browser_[0-9a-f]{32}$/;

export const authorisationSessionStorageCurrent = "cellscript-registry-authorisation-session-current-v1";
export const authorisationSessionStoragePrefix = "cellscript-registry-authorisation-session-token-v1:";

const safeGet = (storage, key) => {
  try { return storage.getItem(key)?.trim() ?? ""; }
  catch { return ""; }
};

const safeSet = (storage, key, value) => {
  try { storage.setItem(key, value); }
  catch { /* The fragment remains usable when storage is unavailable. */ }
};

export function readAuthorisationSession(href, storage) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const storedCurrentSessionId = safeGet(storage, authorisationSessionStorageCurrent).toLowerCase();
  const sessionId = (fragment.get("authorisation_session")
    ?? url.searchParams.get("authorisation_session")
    ?? storedCurrentSessionId).trim().toLowerCase();
  const sessionMode = SESSION_ID_PATTERN.test(sessionId);
  const storageKey = `${authorisationSessionStoragePrefix}${sessionId}`;
  const storedToken = sessionMode ? safeGet(storage, storageKey) : "";
  const fragmentToken = fragment.get("browser_token")?.trim() ?? "";
  const browserToken = BROWSER_TOKEN_PATTERN.test(storedToken) ? storedToken : fragmentToken;

  if (sessionMode && BROWSER_TOKEN_PATTERN.test(browserToken)) {
    safeSet(storage, storageKey, browserToken);
    safeSet(storage, authorisationSessionStorageCurrent, sessionId);
  }

  return {
    sessionId,
    browserToken,
    sessionMode,
    cleanedUrl: sessionMode && url.hash ? `${url.pathname}${url.search}` : null,
  };
}

export function clearAuthorisationSession(storage, sessionId) {
  if (!SESSION_ID_PATTERN.test(sessionId)) return;
  const storageKey = `${authorisationSessionStoragePrefix}${sessionId}`;
  try {
    storage.removeItem(storageKey);
    if (storage.getItem(authorisationSessionStorageCurrent) === sessionId) {
      storage.removeItem(authorisationSessionStorageCurrent);
    }
  } catch {
    // Storage may be disabled; there is no persisted token to clear in that case.
  }
}
