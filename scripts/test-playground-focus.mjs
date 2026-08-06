import assert from "node:assert/strict";
import {
  PLAYGROUND_FOCUS_STORAGE_KEY,
  createPlaygroundFocusController,
  readPlaygroundFocusPreference,
} from "../src/lib/playground-focus.mjs";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

class Toggle extends EventTarget {
  attributes = new Map();

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

const storage = new MemoryStorage();
storage.setItem(PLAYGROUND_FOCUS_STORAGE_KEY, "true");
assert.equal(readPlaygroundFocusPreference(storage), true);
assert.equal(readPlaygroundFocusPreference({ getItem: () => { throw new Error("blocked"); } }), false);

const root = { dataset: {} };
const toggle = new Toggle();
const label = { textContent: "" };
const abortController = new AbortController();
let locale = "en";
let transitions = 0;
const observed = [];
const copy = {
  en: { true: "Exit focus mode", false: "Focus mode" },
  zh: { true: "退出专注模式", false: "专注模式" },
};

const controller = createPlaygroundFocusController({
  root,
  toggle,
  label,
  storage,
  signal: abortController.signal,
  getCopy: (active) => copy[locale][String(active)],
  transition: (commit) => {
    transitions += 1;
    commit();
  },
  onChange: (active) => observed.push(active),
});

assert.equal(controller.active, true);
assert.equal(root.dataset.playgroundFocus, "true");
assert.equal(toggle.getAttribute("aria-pressed"), "true");
assert.equal(toggle.getAttribute("aria-label"), "Exit focus mode");
assert.equal(label.textContent, "Exit focus mode");

toggle.dispatchEvent(new Event("click"));
assert.equal(controller.active, false);
assert.equal(root.dataset.playgroundFocus, "false");
assert.equal(storage.getItem(PLAYGROUND_FOCUS_STORAGE_KEY), "false");
assert.equal(toggle.getAttribute("aria-pressed"), "false");
assert.equal(transitions, 1);

locale = "zh";
controller.syncCopy();
assert.equal(toggle.getAttribute("aria-label"), "专注模式");
assert.equal(label.textContent, "专注模式");

controller.set(true, { animate: false });
assert.equal(root.dataset.playgroundFocus, "true");
assert.equal(storage.getItem(PLAYGROUND_FOCUS_STORAGE_KEY), "true");
assert.deepEqual(observed, [true, false, true]);

abortController.abort();
toggle.dispatchEvent(new Event("click"));
assert.equal(controller.active, true, "aborted controller must detach its click listener");

console.log("playground focus preference lifecycle ok");
