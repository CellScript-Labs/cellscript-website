import assert from "node:assert/strict";
import {
  deriveCellFlow,
  derivePlaygroundInspector,
  findPlaygroundSymbolLine,
} from "../src/lib/playground-presentation.mjs";

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
    effect_class: "Mutating",
    params: [{ name: "token", ty: "Token" }, { name: "next", ty: "Token" }],
    consume_set: [{ binding: "token" }],
    create_set: [{ binding: "next" }],
    estimated_cycles: 336,
    runtime_features: ["consume-input-cell", "verify-output-cell"],
  }],
};

assert.deepEqual(deriveCellFlow(metadata), [{
  name: "transfer",
  effect: "Mutating",
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

console.log("playground Cell Flow and inspector derivation ok");
