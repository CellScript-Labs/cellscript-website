export const PLAYGROUND_SESSION_STORAGE_KEY = "cellscript-playground-session-v1";
export const PLAYGROUND_GUIDE_STORAGE_KEY = "cellscript-playground-guide-v1";

const byteLength = (value) => new TextEncoder().encode(value).length;

const normaliseFile = (file) => {
  if (!file || typeof file.path !== "string" || typeof file.source !== "string") return null;
  return {
    path: file.path,
    source: file.source,
    role: file.role === "entry" ? "entry" : "memory",
  };
};

export const normalisePlaygroundSession = (
  value,
  { maxFiles = 16, maxBytes = 300_000 } = {},
) => {
  if (!value || value.format !== "cellscript-playground-session-v1" || value.version !== 1) return null;
  if (!Array.isArray(value.files) || value.files.length === 0 || value.files.length > maxFiles) return null;
  const files = value.files.map(normaliseFile);
  if (files.some((file) => !file)) return null;
  if (byteLength(files.map((file) => file.source).join("")) > maxBytes) return null;
  const paths = new Set(files.map((file) => file.path));
  if (paths.size !== files.length) return null;
  const activePath = paths.has(value.activePath) ? value.activePath : files[0].path;
  const entryPath = paths.has(value.entryPath)
    ? value.entryPath
    : (files.find((file) => file.role === "entry")?.path ?? activePath);
  return {
    format: "cellscript-playground-session-v1",
    version: 1,
    files: files.map((file) => ({ ...file, role: file.path === entryPath ? "entry" : "memory" })),
    activePath,
    entryPath,
    exampleId: typeof value.exampleId === "string" ? value.exampleId : null,
    outputTab: ["flow", "actions", "types", "metadata"].includes(value.outputTab) ? value.outputTab : "flow",
    mobileView: ["source", "output", "rail"].includes(value.mobileView) ? value.mobileView : "source",
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  };
};

export const readPlaygroundSession = (storage, limits) => {
  try {
    const raw = storage?.getItem(PLAYGROUND_SESSION_STORAGE_KEY);
    return raw ? normalisePlaygroundSession(JSON.parse(raw), limits) : null;
  } catch {
    return null;
  }
};

export const writePlaygroundSession = (storage, value, limits) => {
  try {
    const session = normalisePlaygroundSession(value, limits);
    if (!session) return false;
    storage?.setItem(PLAYGROUND_SESSION_STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
};

export const readPlaygroundGuideComplete = (storage) => {
  try {
    return storage?.getItem(PLAYGROUND_GUIDE_STORAGE_KEY) === "complete";
  } catch {
    return false;
  }
};

export const writePlaygroundGuideComplete = (storage, complete = true) => {
  try {
    if (complete) storage?.setItem(PLAYGROUND_GUIDE_STORAGE_KEY, "complete");
    else storage?.removeItem(PLAYGROUND_GUIDE_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
};

/**
 * @param {{
 *   storage?: Storage | { getItem?: Function, setItem?: Function, removeItem?: Function } | null,
 *   limits?: { maxFiles?: number, maxBytes?: number },
 *   delay?: number,
 *   now?: () => number,
 *   setTimer?: (callback: () => void, delay: number) => any,
 *   clearTimer?: (timer: any) => void,
 *   onState?: (state: "dirty" | "saved" | "unavailable") => void,
 * }} options
 */
export const createPlaygroundSessionWriter = (options = {}) => {
  const {
    storage = null,
    limits = undefined,
    delay = 240,
    now = () => Date.now(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    onState = undefined,
  } = options;
  let timer;
  let pending;

  const flush = () => {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    if (!pending) return false;
    const value = { ...pending, updatedAt: now() };
    pending = undefined;
    const saved = writePlaygroundSession(storage, value, limits);
    onState?.(saved ? "saved" : "unavailable");
    return saved;
  };

  const schedule = (value) => {
    pending = value;
    onState?.("dirty");
    if (timer !== undefined) clearTimer(timer);
    timer = setTimer(flush, delay);
  };

  const cancel = () => {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    pending = undefined;
  };

  return { schedule, flush, cancel };
};
