import assert from "node:assert/strict";
import {
  PLAYGROUND_GUIDE_STORAGE_KEY,
  PLAYGROUND_SESSION_STORAGE_KEY,
  createPlaygroundSessionWriter,
  normalisePlaygroundSession,
  readPlaygroundGuideComplete,
  readPlaygroundSession,
  writePlaygroundGuideComplete,
} from "../src/lib/playground-session.mjs";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const snapshot = {
  format: "cellscript-playground-session-v1",
  version: 1,
  files: [
    { path: "src/main.cell", source: "action main() {}", role: "entry" },
    { path: "src/types.cell", source: "resource Token {}", role: "memory" },
  ],
  activePath: "src/types.cell",
  entryPath: "src/main.cell",
  exampleId: null,
  outputTab: "flow",
  mobileView: "output",
};

assert.equal(normalisePlaygroundSession(null), null);
assert.equal(normalisePlaygroundSession({ ...snapshot, version: 2 }), null);
assert.equal(normalisePlaygroundSession({ ...snapshot, files: [] }), null);
assert.equal(normalisePlaygroundSession({ ...snapshot, files: [{ path: "a.cell", source: "x" }, { path: "a.cell", source: "y" }] }), null);
assert.equal(normalisePlaygroundSession({ ...snapshot, files: [{ path: "a.cell", source: "x".repeat(20) }] }, { maxBytes: 8 }), null);

const storage = new MemoryStorage();
const states = [];
let scheduled;
const writer = createPlaygroundSessionWriter({
  storage,
  now: () => 42,
  onState: (state) => states.push(state),
  setTimer: (callback) => { scheduled = callback; return 1; },
  clearTimer: () => {},
});
writer.schedule(snapshot);
assert.deepEqual(states, ["dirty"]);
scheduled();
assert.deepEqual(states, ["dirty", "saved"]);
assert.equal(storage.values.has(PLAYGROUND_SESSION_STORAGE_KEY), true);
assert.deepEqual(readPlaygroundSession(storage), { ...snapshot, updatedAt: 42 });

storage.setItem(PLAYGROUND_SESSION_STORAGE_KEY, "not json");
assert.equal(readPlaygroundSession(storage), null);
assert.equal(readPlaygroundSession({ getItem() { throw new Error("blocked"); } }), null);

assert.equal(readPlaygroundGuideComplete(storage), false);
assert.equal(writePlaygroundGuideComplete(storage), true);
assert.equal(storage.getItem(PLAYGROUND_GUIDE_STORAGE_KEY), "complete");
assert.equal(readPlaygroundGuideComplete(storage), true);
assert.equal(writePlaygroundGuideComplete(storage, false), true);
assert.equal(readPlaygroundGuideComplete(storage), false);

console.log("playground local session lifecycle ok");
