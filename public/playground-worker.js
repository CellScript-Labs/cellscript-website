let wasmModulePromise;
let wasmModule;
const COMPILER_ASSET_VERSION = new URL(self.location.href).searchParams.get("v");
const CELLSCRIPT_EDITION = "2026";
const COMPILER_LOAD_TIMEOUT_MS = 12_000;

const loadCompiler = async () => {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, COMPILER_LOAD_TIMEOUT_MS);

      try {
        if (!/^[0-9a-f]{64}$/.test(COMPILER_ASSET_VERSION ?? "")) {
          throw Object.assign(new Error("compiler asset SHA-256 is required"), { code: "compiler_asset_identity_required" });
        }
        const mod = await import(`/wasm/cellscript_wasm.js?v=${COMPILER_ASSET_VERSION}`);
        const response = await fetch(`/wasm/cellscript_wasm_bg.wasm?v=${COMPILER_ASSET_VERSION}`, {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`compiler download failed with HTTP ${response.status}`);
        await mod.default({ module_or_path: response });
        wasmModule = mod;
        return mod;
      } catch (error) {
        wasmModulePromise = undefined;
        if (timedOut) {
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
  const { id, type, source, sources, entryPath, target, line, character } = event.data || {};
  if (type !== "compile" && type !== "language") return;

  try {
    const mod = await loadCompiler();
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
    if (sources !== undefined) {
      if (!Array.isArray(sources) || !sources.length || typeof entryPath !== "string" || !entryPath) {
        throw new Error("compiler source set requires files and an entry path");
      }
      raw = mod.compile_metadata_json_sources(JSON.stringify(sources), entryPath, CELLSCRIPT_EDITION, target || null);
    } else {
      raw = mod.compile_metadata_json_diagnostics(source || "", CELLSCRIPT_EDITION, target || null);
    }
    const payload = JSON.parse(raw);
    self.postMessage({
      id,
      type: "result",
      elapsed: Math.round(performance.now() - start),
      version: mod.version?.() || "",
      payload,
    });
  } catch (error) {
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
