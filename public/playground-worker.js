let wasmModulePromise;
let wasmModule;
const COMPILER_ASSET_VERSION = "20260731-v0.22.0-9bb2d765";
const CELLSCRIPT_EDITION = "2026";
const COMPILER_LOAD_TIMEOUT_MS = 12_000;
let latestCompileId = 0;
const latestLanguageIdByIntent = {
  hover: 0,
  completion: 0,
  definition: 0,
};

const loadCompiler = async () => {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      const controller = new AbortController();
      let timedOut = false;
      let rejectDeadline;
      const deadline = new Promise((_, reject) => {
        rejectDeadline = reject;
      });
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
        const timeoutError = new Error("compiler download timed out");
        timeoutError.code = "compiler_load_timeout";
        rejectDeadline(timeoutError);
      }, COMPILER_LOAD_TIMEOUT_MS);

      try {
        const [mod, response] = await Promise.race([
          Promise.all([
            import(`/wasm/cellscript_wasm.js?v=${COMPILER_ASSET_VERSION}`),
            fetch(`/wasm/cellscript_wasm_bg.wasm?v=${COMPILER_ASSET_VERSION}`, {
              cache: "force-cache",
              signal: controller.signal,
            }),
          ]),
          deadline,
        ]);
        if (!response.ok) throw new Error(`compiler download failed with HTTP ${response.status}`);
        await Promise.race([mod.default({ module_or_path: response }), deadline]);
        wasmModule = mod;
        return mod;
      } catch (error) {
        wasmModulePromise = undefined;
        if (timedOut && error?.code !== "compiler_load_timeout") {
          const timeoutError = new Error("compiler download timed out");
          timeoutError.code = "compiler_load_timeout";
          throw timeoutError;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    })();
  }
  return wasmModulePromise;
};

self.addEventListener("message", async (event) => {
  const { id, type, intent, source, sources, entryPath, target, line, character } = event.data || {};
  if (type !== "compile" && type !== "language") return;
  if (type === "compile") latestCompileId = Math.max(latestCompileId, id || 0);
  if (type === "language" && intent in latestLanguageIdByIntent) {
    latestLanguageIdByIntent[intent] = Math.max(latestLanguageIdByIntent[intent], id || 0);
  }
  const requestIsCurrent = () => type === "compile"
    ? id === latestCompileId
    : intent in latestLanguageIdByIntent && id === latestLanguageIdByIntent[intent];

  try {
    const mod = await loadCompiler();
    if (!requestIsCurrent()) return;
    if (type === "language") {
      const query = mod.language_service_json;
      if (!query) {
        self.postMessage({
          id,
          type: "language-result",
          payload: { completions: [], hover: null, definition: null, diagnostics: [] },
        });
        return;
      }
      self.postMessage({
        id,
        type: "language-result",
        payload: JSON.parse(query(source || "", line || 0, character || 0)),
      });
      return;
    }

    const start = performance.now();
    let raw;
    if (Array.isArray(sources) && sources.length && entryPath && mod.compile_metadata_json_sources) {
      raw = mod.compile_metadata_json_sources(JSON.stringify(sources), entryPath, CELLSCRIPT_EDITION, target || null);
    } else {
      const compile =
        mod.compile_metadata_json_diagnostics ||
        ((src, edition, artifactTarget) => {
          const fallbackRaw = mod.compile_metadata_json(src, edition, artifactTarget);
          const parsed = JSON.parse(fallbackRaw);
          return JSON.stringify(parsed.error ? { metadata: null, diagnostics: [{ message: parsed.error, severity: "error" }] } : { metadata: parsed, diagnostics: [] });
        });
      raw = compile(source || "", CELLSCRIPT_EDITION, target || null);
    }
    const payload = JSON.parse(raw);
    if (!requestIsCurrent()) return;
    self.postMessage({
      id,
      type: "result",
      elapsed: Math.round(performance.now() - start),
      version: mod.version?.() || "",
      payload,
    });
  } catch (error) {
    if (!requestIsCurrent()) return;
    if (!wasmModule) {
      self.postMessage({
        id,
        type: "compiler-error",
        code: error?.code || "compiler_load_failed",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    self.postMessage({
      id,
      type: "result",
      elapsed: 0,
      version: wasmModule?.version?.() || "",
      payload: {
        metadata: null,
        diagnostics: [{
          message: error instanceof Error ? error.message : String(error),
          severity: "error",
        }],
      },
    });
  }
});
