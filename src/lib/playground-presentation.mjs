const asArray = (value) => Array.isArray(value) ? value : [];

const normaliseCellRef = (value, index, fallback = "Cell") => {
  if (typeof value === "string") return { binding: value, type: fallback };
  const binding = String(value?.binding || value?.name || `cell_${index + 1}`);
  return {
    binding,
    type: String(value?.ty || value?.type || fallback),
  };
};

const paramsByBinding = (action) => new Map(
  asArray(action?.params)
    .filter((param) => param?.name && param?.ty)
    .map((param) => [String(param.name), String(param.ty)]),
);

const normaliseSet = (action, key) => {
  const params = paramsByBinding(action);
  return asArray(action?.[key]).map((value, index) => {
    const cell = normaliseCellRef(value, index);
    return { ...cell, type: cell.type === "Cell" ? (params.get(cell.binding) || "Cell") : cell.type };
  });
};

const runtimeFeatures = (action) => {
  const raw = action?.ckb_runtime_features || action?.runtime_features || action?.target_features || action?.runtime?.features || [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (raw && typeof raw === "object") return Object.keys(raw).filter((key) => Boolean(raw[key]));
  return typeof raw === "string" && raw.trim() ? [raw.trim()] : [];
};

export const deriveCellFlow = (data) => asArray(data?.actions).map((action) => ({
  name: String(action?.name || "action"),
  effect: String(action?.effect_class || "Pure"),
  inputs: normaliseSet(action, "consume_set"),
  outputs: normaliseSet(action, "create_set"),
  mutations: normaliseSet(action, "mutate_set"),
  cycles: Number.isFinite(action?.estimated_cycles) ? action.estimated_cycles : null,
  runtime: runtimeFeatures(action),
}));

export const findPlaygroundSymbolLine = (source, name, kind = "action") => {
  if (!source || !name) return 1;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = kind === "type"
    ? "(?:resource|struct|enum|shared|receipt|schema)"
    : "(?:action|lock|fn)";
  const matcher = new RegExp(`^[ \\t]*${prefix}\\s+${escaped}\\b`, "m");
  const match = matcher.exec(source);
  if (!match) return 1;
  return source.slice(0, match.index).split("\n").length;
};

export const derivePlaygroundInspector = (data, selection) => {
  const actions = deriveCellFlow(data);
  const types = asArray(data?.types);
  if (selection?.kind === "action") {
    const action = actions.find((item) => item.name === selection.name);
    if (action) return { kind: "action", ...action };
  }
  if (selection?.kind === "type") {
    const type = types.find((item) => String(item?.name) === selection.name);
    if (type) {
      const usedBy = actions
        .filter((action) => [...action.inputs, ...action.outputs, ...action.mutations].some((cell) => cell.type === selection.name))
        .map((action) => action.name);
      return {
        kind: "type",
        name: String(type.name),
        typeKind: String(type.kind || "type"),
        capabilities: asArray(type.capabilities).map(String),
        encodedSize: Number.isFinite(type.encoded_size) ? type.encoded_size : null,
        usedBy,
      };
    }
  }
  return {
    kind: "summary",
    module: String(data?.module || "—"),
    target: String(data?.target_profile?.name || data?.target_profile || "ckb"),
    actions: actions.length,
    types: types.length,
    artifactSize: Number.isFinite(data?.artifact_size_bytes) ? data.artifact_size_bytes : null,
    artifactFormat: String(data?.artifact_format || "—"),
  };
};
