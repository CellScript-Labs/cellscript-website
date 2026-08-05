import assert from "node:assert/strict";
import {
  clearRegistrySubmitDraft,
  readRegistrySubmitDraft,
  registrySubmitDraftKey,
  writeRegistrySubmitDraft,
} from "../src/lib/registry-submit-draft.mjs";

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};

const mainnetKey = registrySubmitDraftKey("production", "mainnet");
const testnetKey = registrySubmitDraftKey("testnet-sandbox", "testnet");
assert.notEqual(mainnetKey, testnetKey);

writeRegistrySubmitDraft(storage, mainnetKey, {
  fields: {
    artifact_kind: "deployable_contract",
    namespace: "dob",
    name: "profile-v1",
    path: "./contracts/profile-v1",
    capability_payload: "must-not-persist",
    wallet_signature: "must-not-persist",
    browser_token: "must-not-persist",
  },
  manualOpen: true,
  profileOpen: true,
  authorisationMode: "existing",
});

const draft = readRegistrySubmitDraft(storage, mainnetKey);
assert.equal(draft.fields.artifact_kind, "deployable_contract");
assert.equal(draft.fields.namespace, "dob");
assert.equal(draft.fields.name, "profile-v1");
assert.equal(draft.fields.path, "./contracts/profile-v1");
assert.equal(draft.manualOpen, true);
assert.equal(draft.profileOpen, true);
assert.equal(draft.authorisationMode, "existing");
assert.equal(Object.hasOwn(draft.fields, "capability_payload"), false);
assert.equal(Object.hasOwn(draft.fields, "wallet_signature"), false);
assert.equal(Object.hasOwn(draft.fields, "browser_token"), false);
assert.equal(readRegistrySubmitDraft(storage, testnetKey), null);

values.set(mainnetKey, "not-json");
assert.equal(readRegistrySubmitDraft(storage, mainnetKey), null);
clearRegistrySubmitDraft(storage, mainnetKey);
assert.equal(values.has(mainnetKey), false);

console.log("registry submit draft tests passed");
