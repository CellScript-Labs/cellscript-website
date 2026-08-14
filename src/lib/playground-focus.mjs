export const PLAYGROUND_FOCUS_STORAGE_KEY = "cellscript-playground-focus-mode";

export const readPlaygroundFocusPreference = (storage) => {
  try {
    return storage?.getItem(PLAYGROUND_FOCUS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const writePlaygroundFocusPreference = (storage, active) => {
  try {
    storage?.setItem(PLAYGROUND_FOCUS_STORAGE_KEY, active ? "true" : "false");
  } catch {
    // Focus mode remains usable when storage is unavailable.
  }
};

export const createPlaygroundFocusController = ({
  root,
  toggle,
  label,
  storage,
  signal,
  getCopy,
  transition,
  onChange,
}) => {
  let active = readPlaygroundFocusPreference(storage);

  const syncCopy = () => {
    const copy = getCopy(active);
    toggle.setAttribute("aria-pressed", active ? "true" : "false");
    toggle.setAttribute("aria-label", copy);
    toggle.setAttribute("title", copy);
    if (label) label.textContent = copy;
  };

  const apply = (next, persist) => {
    active = Boolean(next);
    root.dataset.playgroundFocus = active ? "true" : "false";
    if (persist) writePlaygroundFocusPreference(storage, active);
    syncCopy();
    onChange?.(active);
  };

  const set = (next, { persist = true, animate = true } = {}) => {
    if (Boolean(next) === active) {
      syncCopy();
      return;
    }
    const commit = () => apply(next, persist);
    if (animate && transition) transition(commit);
    else commit();
  };

  const handleToggle = () => set(!active);
  toggle.addEventListener("click", handleToggle);
  signal?.addEventListener("abort", () => toggle.removeEventListener("click", handleToggle), { once: true });

  apply(active, false);

  return {
    get active() {
      return active;
    },
    set,
    syncCopy,
  };
};
