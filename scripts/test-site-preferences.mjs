import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const root = resolve(".");
const dist = resolve(root, process.argv[2] || "dist");
const read = (path) => readFileSync(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const extractScripts = (html) =>
  [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

const pages = ["registry/index.html", "registry/submit/index.html", "registry/api/index.html"];
const pageScripts = pages.map((page) => {
  const html = read(resolve(dist, page));
  const script = extractScripts(html).find((candidate) => candidate.includes("__cellscriptTopbarDelegationBound"));
  assert(script, `${page}: missing the shared site-preference controller`);
  assert(html.includes("data-astro-rerun"), `${page}: missing the pre-render preference bootstrap`);
  return script;
});

class FakeElement {
  constructor(selectors = []) {
    this.attributes = new Map();
    this.dataset = {};
    this.lang = "";
    this.selectors = new Set(selectors);
    this.textContent = "";
    this.hidden = false;
    this.focused = false;
  }

  closest(selector) {
    return this.selectors.has(selector) ? this : null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      delete this.dataset[key];
    }
  }

  toggleAttribute(name, force) {
    if (force) this.attributes.set(name, "");
    else this.attributes.delete(name);
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  focus() {
    this.focused = true;
    document.activeElement = this;
  }
}

class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

const listeners = new Map();
const windowListeners = new Map();
const addListener = (target, type, listener) => {
  const current = target.get(type) || [];
  current.push(listener);
  target.set(type, current);
};
const dispatch = (target, type, event) => {
  for (const listener of target.get(type) || []) listener(event);
};

const stored = new Map([
  ["cellscript-theme", "light"],
  ["cellscript-locale", "en"],
]);
const localStorage = {
  getItem(key) {
    return stored.has(key) ? stored.get(key) : null;
  },
  setItem(key, value) {
    stored.set(key, String(value));
  },
};

let documentRoot = new FakeElement();
documentRoot.dataset.theme = "light";
documentRoot.dataset.locale = "en";
documentRoot.lang = "en";
const themeButton = new FakeElement(["[data-theme-toggle]"]);
const menuButton = new FakeElement(["[data-menu-toggle]"]);
menuButton.setAttribute("aria-expanded", "false");
const drawerLink = new FakeElement(["[data-nav-drawer] a"]);
const drawerClose = new FakeElement(["[data-menu-close]"]);
const drawer = new FakeElement();
drawer.querySelector = () => drawerLink;
drawer.querySelectorAll = () => [drawerLink, drawerClose];
const backdrop = new FakeElement(["[data-nav-drawer-backdrop]"]);
backdrop.hidden = true;
const header = new FakeElement();
const body = new FakeElement();

const document = {
  body,
  activeElement: null,
  get documentElement() {
    return documentRoot;
  },
  querySelector(selector) {
    if (selector === "[data-nav-drawer-backdrop]") return backdrop;
    if (selector === "[data-nav-drawer]") return drawer;
    if (selector === "[data-menu-toggle]") return menuButton;
    if (selector === ".site-header") return header;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === "[data-theme-toggle]") return [themeButton];
    return [];
  },
  addEventListener(type, listener) {
    addListener(listeners, type, listener);
  },
};

const window = {
  scrollY: 0,
  addEventListener(type, listener) {
    addListener(windowListeners, type, listener);
  },
  dispatchEvent() {},
  matchMedia() {
    return { matches: false, addEventListener() {} };
  },
  requestAnimationFrame(callback) {
    callback();
  },
  setTimeout(callback) {
    callback();
    return 1;
  },
};

vm.runInNewContext(pageScripts[0], {
  CustomEvent: FakeCustomEvent,
  Element: FakeElement,
  HTMLElement: FakeElement,
  document,
  localStorage,
  window,
});

assert(window.__cellscriptTopbarDelegationBound === true, "site preference controller did not bind");
assert((listeners.get("click") || []).length === 1, "theme click delegation was not registered exactly once");
assert((listeners.get("astro:before-swap") || []).length === 1, "Astro swap preservation was not registered");
assert((listeners.get("astro:page-load") || []).length === 1, "Astro page-load synchronisation was not registered");
assert((listeners.get("keydown") || []).length === 1, "drawer keyboard handling was not registered exactly once");

dispatch(listeners, "click", { target: menuButton, preventDefault() {} });
assert(backdrop.hidden === false, "navigation drawer did not open");
assert(menuButton.attributes.get("aria-expanded") === "true", "navigation toggle did not expose its open state");
assert(body.dataset.menuOpen === "true", "open navigation drawer did not lock page scrolling");
assert(drawerLink.focused, "navigation drawer did not move focus to its first action");

dispatch(listeners, "keydown", { key: "Escape", preventDefault() {} });
assert(backdrop.hidden === true, "Escape did not close the navigation drawer");
assert(menuButton.attributes.get("aria-expanded") === "false", "navigation toggle did not expose its closed state");
assert(menuButton.focused, "closing the navigation drawer did not restore focus");

let prevented = false;
dispatch(listeners, "click", {
  target: themeButton,
  preventDefault() {
    prevented = true;
  },
});
assert(prevented, "theme click was not handled");
assert(documentRoot.dataset.theme === "dark", "theme click did not select dark mode");
assert(stored.get("cellscript-theme") === "dark", "dark selection was not persisted");
assert(themeButton.attributes.get("aria-pressed") === "true", "theme control did not expose dark state");

const submitRoot = new FakeElement();
submitRoot.dataset.theme = "light";
submitRoot.dataset.locale = "en";
dispatch(listeners, "astro:before-swap", { newDocument: { documentElement: submitRoot } });
assert(submitRoot.dataset.theme === "dark", "Registry to Submit navigation lost the selected theme");
documentRoot = submitRoot;
dispatch(listeners, "astro:page-load", {});
assert(documentRoot.dataset.theme === "dark", "Submit page-load did not restore the persisted theme");

dispatch(listeners, "click", { target: themeButton, preventDefault() {} });
assert(documentRoot.dataset.theme === "light", "second theme click did not select light mode");
assert(stored.get("cellscript-theme") === "light", "light selection was not persisted");

const apiRoot = new FakeElement();
apiRoot.dataset.theme = "dark";
apiRoot.dataset.locale = "en";
dispatch(listeners, "astro:before-swap", { newDocument: { documentElement: apiRoot } });
assert(apiRoot.dataset.theme === "light", "Submit to API navigation replaced the explicit light selection");
documentRoot = apiRoot;
dispatch(listeners, "astro:page-load", {});
assert(documentRoot.dataset.theme === "light", "API page-load replaced the explicit light selection");
assert(themeButton.attributes.get("aria-pressed") === "false", "theme control did not expose light state");

stored.set("cellscript-theme", "dark");
dispatch(windowListeners, "storage", { key: "cellscript-theme", newValue: "dark" });
assert(documentRoot.dataset.theme === "dark", "cross-tab theme change was not applied");

const bootstrapSource = read(resolve(root, "src/components/SitePreferencesBootstrap.astro"));
const bootstrap = extractScripts(bootstrapSource)[0];
assert(bootstrap, "missing pre-render preference bootstrap source");
stored.set("cellscript-theme", "light");
const reloadRoot = new FakeElement();
reloadRoot.dataset.theme = "dark";
reloadRoot.dataset.locale = "en";
vm.runInNewContext(bootstrap, {
  document: { documentElement: reloadRoot },
  localStorage,
});
assert(reloadRoot.dataset.theme === "light", "reload did not preserve the explicit light selection");

console.log(`site preference lifecycle ok (${pages.length} Registry routes)`);
