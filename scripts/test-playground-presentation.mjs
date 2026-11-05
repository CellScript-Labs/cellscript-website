import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deriveCellFlow,
  derivePlaygroundInspector,
  findPlaygroundSymbolLine,
} from "../src/lib/playground-presentation.mjs";
import {
  actionEffectFacts, readEffectFacts, formatEffectFacts, combineEffectFacts,
} from "../src/lib/effect-facts.mjs";

const facts = {
  context_reads: [{ source: { kind: "input" }, access: "capacity" }],
  lifecycle_ops: ["consume", "create", "transfer"],
  process_ops: ["pipe-write"],
};
const empty = { context_reads: [], lifecycle_ops: [], process_ops: [] };

// Data is shared with the independent Rust checker and Registry reader; no
// browser implementation is imported into either admission implementation.
const factVectors = JSON.parse(readFileSync(new URL("../../crates/cellscript-artifact-checker/src/effect_facts_vectors.json", import.meta.url), "utf8"));
for (const { name, value } of factVectors.valid) assert.deepEqual(readEffectFacts(value), value, name);
for (const { name, value } of factVectors.invalid) assert.throws(() => readEffectFacts(value), undefined, name);

const metadata = {
  module: "cellscript::token",
  target_profile: { name: "ckb" },
  artifact_size_bytes: 128,
  types: [
    { name: "Token", kind: "Resource", capabilities: ["consume", "create"], encoded_size: 16 },
    { name: "Authority", kind: "Resource", capabilities: ["replace"] },
  ],
  actions: [{
    name: "transfer",
    effects: facts,
    params: [{ name: "token", ty: "Token" }, { name: "next", ty: "Token" }],
    consume_set: [{ binding: "token" }],
    create_set: [{ binding: "next" }],
    estimated_cycles: 336,
    runtime_features: ["consume-input-cell", "verify-output-cell"],
  }],
};

assert.deepEqual(deriveCellFlow(metadata), [{
  name: "transfer",
  effects: facts,
  inputs: [{ binding: "token", type: "Token" }],
  outputs: [{ binding: "next", type: "Token" }],
  mutations: [],
  cycles: 336,
  runtime: ["consume-input-cell", "verify-output-cell"],
}]);
assert.equal(findPlaygroundSymbolLine("module x\n\naction transfer() {}\n", "transfer", "action"), 3);
assert.equal(findPlaygroundSymbolLine("resource Token {}\naction transfer() {}", "Token", "type"), 1);
assert.equal(findPlaygroundSymbolLine("", "missing", "action"), 1);
assert.deepEqual(derivePlaygroundInspector(metadata, { kind: "action", name: "transfer" }).inputs[0], { binding: "token", type: "Token" });
assert.deepEqual(derivePlaygroundInspector(metadata, { kind: "type", name: "Token" }).usedBy, ["transfer"]);
assert.equal(derivePlaygroundInspector(metadata, null).actions, 1);

assert.equal(formatEffectFacts(facts), "Reads: input.capacity; Cell operations: consume, create, transfer; Process: pipe-write");
assert.equal(formatEffectFacts(empty), "No external operations");
assert.equal(formatEffectFacts(empty, { reads: "读取", lifecycle: "Cell 操作", process: "进程", empty: "无外部操作" }), "无外部操作");
assert.deepEqual(combineEffectFacts([facts, empty, facts]), facts);
const relative = {
  ...empty,
  context_reads: [
    { source: { kind: "parameter", index: 2 }, access: "cell-data" },
    { source: { kind: "parameter", index: 10 }, access: "cell-data" },
  ],
};
assert.equal(formatEffectFacts(relative), "Reads: parameter[2].cell-data, parameter[10].cell-data");

for (const invalid of [
  undefined, null, "Pure", {}, { context_reads: [], lifecycle_ops: [] },
  { ...empty, effect_class: "Pure" },
  { ...empty, process_ops: ["Pure"] },
  { ...empty, process_ops: ["pipe-write", "exec"] },
  { ...empty, process_ops: ["spawn", "spawn"] },
  { ...empty, process_ops: Array(4097).fill("spawn") },
  { ...empty, lifecycle_ops: ["replace"] },
  { ...empty, context_reads: [{ source: { kind: "input", index: 0 }, access: "capacity" }] },
  { ...empty, context_reads: [{ source: { kind: "parameter", index: -1 }, access: "capacity" }] },
  { ...empty, context_reads: [{ source: { kind: "parameter", index: 65536 }, access: "capacity" }] },
  { ...empty, context_reads: [{ source: { kind: "unknown" }, access: "capacity" }] },
  { ...empty, context_reads: [{ source: { kind: "input" }, access: "unknown" }] },
  { ...empty, context_reads: [...relative.context_reads].reverse() },
]) assert.throws(() => readEffectFacts(invalid));
for (const action of [
  {}, { effects: null }, { effect_class: "Pure" }, { effect_class: "Pure", effects: empty },
  { effect: "ReadOnly", effects: empty }, { effects: empty, effectClass: "Mutating" },
]) {
  assert.throws(() => actionEffectFacts(action));
  assert.throws(() => deriveCellFlow({ actions: [action] }));
}
for (const field of [
  "effect", "effect_class", "effectClass", "declared_effect", "declared_effects",
  "declared_effect_class", "effect_declared", "inferred_effect_class", "effect_summary",
]) {
  const action = { effects: empty, [field]: "Pure" };
  assert.throws(() => actionEffectFacts(action), /Unsupported action effect protocol/);
  assert.throws(() => deriveCellFlow({ actions: [action] }));
}

const playgroundSource = readFileSync(new URL("../src/pages/playground.astro", import.meta.url), "utf8");
assert.match(playgroundSource, /browserBoundaryLanguage/);
assert.match(playgroundSource, /browserBoundaryElf/);
assert.match(playgroundSource, /browserBoundaryVm/);
assert.match(playgroundSource, /browserBoundaryEquivalence/);

console.log("playground Cell Flow and inspector derivation ok");
