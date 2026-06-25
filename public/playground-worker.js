let wasmModulePromise;
let wasmModule;
const COMPILER_ASSET_VERSION = "20260625-multi-diagnostics";

const loadCompiler = async () => {
  if (!wasmModulePromise) {
    wasmModulePromise = import(`/wasm/cellscript_wasm.js?v=${COMPILER_ASSET_VERSION}`).then(async (mod) => {
      await mod.default({ module_or_path: `/wasm/cellscript_wasm_bg.wasm?v=${COMPILER_ASSET_VERSION}` });
      wasmModule = mod;
      return mod;
    });
  }
  return wasmModulePromise;
};

self.addEventListener("message", async (event) => {
  const { id, type, source, target, line, character } = event.data || {};
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
    const compile =
      mod.compile_metadata_json_diagnostics ||
      ((src, artifactTarget) => {
        const raw = mod.compile_metadata_json(src, artifactTarget);
        const parsed = JSON.parse(raw);
        return JSON.stringify(parsed.error ? { metadata: null, diagnostics: [{ message: parsed.error, severity: "error" }] } : { metadata: parsed, diagnostics: [] });
      });
    const raw = compile(source || "", target || null);
    const payload = JSON.parse(raw);
    self.postMessage({
      id,
      type: "result",
      elapsed: Math.round(performance.now() - start),
      version: mod.version?.() || "",
      payload,
    });
  } catch (error) {
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
