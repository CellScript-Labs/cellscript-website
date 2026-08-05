import assert from "node:assert/strict";
import {
  authorisationSessionStorageCurrent,
  authorisationSessionStoragePrefix,
  clearAuthorisationSession,
  readAuthorisationSession,
} from "../src/lib/authorisation-session-storage.mjs";

class MemorySessionStorage {
  values = new Map();

  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const sessionId = "auth_0123456789abcdef0123456789abcdef";
const browserToken = "browser_0123456789abcdef0123456789abcdef";
const storage = new MemorySessionStorage();

const opened = readAuthorisationSession(
  `https://cellscript.dev/registry/submit#authorisation_session=${sessionId}&browser_token=${browserToken}`,
  storage,
);
assert.equal(opened.sessionMode, true);
assert.equal(opened.sessionId, sessionId);
assert.equal(opened.browserToken, browserToken);
assert.equal(opened.cleanedUrl, "/registry/submit");
assert.equal(storage.getItem(`${authorisationSessionStoragePrefix}${sessionId}`), browserToken);
assert.equal(storage.getItem(authorisationSessionStorageCurrent), sessionId);

const refreshed = readAuthorisationSession("https://cellscript.dev/registry/submit", storage);
assert.equal(refreshed.sessionMode, true);
assert.equal(refreshed.sessionId, sessionId);
assert.equal(refreshed.browserToken, browserToken);
assert.equal(refreshed.cleanedUrl, null);

clearAuthorisationSession(storage, sessionId);
assert.equal(storage.getItem(`${authorisationSessionStoragePrefix}${sessionId}`), null);
assert.equal(storage.getItem(authorisationSessionStorageCurrent), null);
assert.equal(readAuthorisationSession("https://cellscript.dev/registry/submit", storage).sessionMode, false);

console.log("authorisation session storage lifecycle ok");
