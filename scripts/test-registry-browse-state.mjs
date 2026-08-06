import assert from "node:assert/strict";
import { readRegistryBrowseState, registryBrowseStateUrl } from "../src/lib/registry-browse-state.mjs";

const restored = readRegistryBrowseState("https://cellscript.dev/registry/?q=btc&kind=runtime_verifier&intent=needs_evidence#ignored");
assert.deepEqual(restored, { q: "btc", kind: "runtime_verifier", intent: "needs_evidence" });

const updated = new URL(registryBrowseStateUrl("https://cellscript.dev/registry/?unrelated=keep&q=old", {
  q: "dob profile",
  kind: "profile_library",
  intent: "ready",
}));
assert.equal(updated.searchParams.get("unrelated"), "keep");
assert.equal(updated.searchParams.get("q"), "dob profile");
assert.equal(updated.searchParams.get("kind"), "profile_library");
assert.equal(updated.searchParams.get("intent"), "ready");

const cleared = new URL(registryBrowseStateUrl(updated, { q: "", kind: "", intent: "" }));
assert.equal(cleared.searchParams.has("q"), false);
assert.equal(cleared.searchParams.has("kind"), false);
assert.equal(cleared.searchParams.has("intent"), false);
assert.equal(cleared.searchParams.get("unrelated"), "keep");

console.log("registry browse URL-state tests passed");
