// Current effect-facts wire contract. Missing facts are an error, never an
// empty contract. The UI displays concrete facts without reducing categories.
const sources = new Set([
  "input", "group-input", "output", "group-output", "cell-dep", "header-dep",
  "witness", "current-script", "transaction", "header-evidence", "parameter",
]);
const accesses = new Set([
  "cell-data", "capacity", "occupied-capacity", "lock-script", "type-script",
  "out-point", "since", "index", "cardinality", "role-selection", "header",
  "transaction", "script", "witness", "environment-evidence",
]);
const lifecycle = new Set(["consume", "destroy", "create", "replace", "transfer", "claim", "settle"]);
const processes = new Set([
  "spawn", "exec", "wait", "pipe-create", "pipe-read", "pipe-write", "close",
  "inherited-descriptors", "process-id",
]);
const maxFacts = 4096;
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function exactKeys(value, expected) {
  if (!object(value) || Object.keys(value).length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    throw new Error("Invalid effect facts: required current fields do not match");
  }
}

function compareReads(left, right) {
  return compare(left.source.kind, right.source.kind)
    || compare(left.source.index ?? 0, right.source.index ?? 0)
    || compare(left.access, right.access);
}

function canonicalSet(value, validate, order) {
  if (!Array.isArray(value) || value.length > maxFacts) throw new Error("Invalid effect facts: bounded array required");
  value.forEach((item, index) => {
    validate(item);
    if (index > 0 && order(value[index - 1], item) >= 0) throw new Error("Invalid effect facts: facts must be unique and canonically ordered");
  });
}

/** Validate a complete current fact object, preserving its exact wire shape. */
export function readEffectFacts(value) {
  exactKeys(value, ["context_reads", "lifecycle_ops", "process_ops"]);
  canonicalSet(value.context_reads, (read) => {
    exactKeys(read, ["source", "access"]);
    const source = read.source;
    if (!object(source) || !sources.has(source.kind)) throw new Error("Invalid effect facts: unknown context source");
    exactKeys(source, source.kind === "parameter" ? ["kind", "index"] : ["kind"]);
    if (source.kind === "parameter" && (!Number.isInteger(source.index) || source.index < 0 || source.index > 65535)) {
      throw new Error("Invalid effect facts: parameter index outside u16");
    }
    if (!accesses.has(read.access)) throw new Error("Invalid effect facts: unknown context access");
  }, compareReads);
  canonicalSet(value.lifecycle_ops, (op) => {
    if (!lifecycle.has(op)) throw new Error("Invalid effect facts: unknown Cell operation");
  }, compare);
  canonicalSet(value.process_ops, (op) => {
    if (!processes.has(op)) throw new Error("Invalid effect facts: unknown process operation");
  }, compare);
  const ops = new Set(value.lifecycle_ops);
  for (const op of ["destroy", "replace", "transfer", "claim", "settle"]) {
    if (ops.has(op) && (!ops.has("consume") || (op !== "destroy" && !ops.has("create")))) {
      throw new Error("Invalid effect facts: compound Cell operation lacks constituents");
    }
  }
  return value;
}

/** Read executable action evidence; retired or ambiguous forms are rejected. */
export function actionEffectFacts(action) {
  if (!object(action) || [
    "effect", "effect_class", "effectClass", "declared_effect", "declared_effects",
    "declared_effect_class", "effect_declared", "inferred_effect_class", "effect_summary",
  ].some((key) => Object.hasOwn(action, key))) {
    throw new Error("Unsupported action effect protocol");
  }
  return readEffectFacts(action.effects);
}

export const effectFactLabels = Object.freeze({
  reads: "Reads", lifecycle: "Cell operations", process: "Process", empty: "No external operations",
});

/** Format every fact; local computation is not described as a success guarantee. */
export function formatEffectFacts(value, labels = effectFactLabels) {
  const facts = readEffectFacts(value);
  const reads = facts.context_reads.map(({ source, access }) => `${source.kind}${source.kind === "parameter" ? `[${source.index}]` : ""}.${access}`);
  const dimensions = [
    [labels.reads, reads], [labels.lifecycle, facts.lifecycle_ops], [labels.process, facts.process_ops],
  ];
  return dimensions.filter(([, items]) => items.length).map(([label, items]) => `${label}: ${items.join(", ")}`).join("; ") || labels.empty;
}

/** Product union for a multi-action presentation, with no inferred new facts. */
export function combineEffectFacts(values) {
  const reads = new Map();
  const cells = new Set();
  const ipc = new Set();
  for (const value of values) {
    const facts = readEffectFacts(value);
    for (const read of facts.context_reads) reads.set(`${read.source.kind}/${read.source.index ?? 0}/${read.access}`, read);
    for (const op of facts.lifecycle_ops) cells.add(op);
    for (const op of facts.process_ops) ipc.add(op);
  }
  return readEffectFacts({
    context_reads: [...reads.values()].sort(compareReads),
    lifecycle_ops: [...cells].sort(compare),
    process_ops: [...ipc].sort(compare),
  });
}
