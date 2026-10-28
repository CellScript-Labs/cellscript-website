import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  compile_metadata_json,
  compile_metadata_json_diagnostics,
  compile_metadata_json_sources,
  initSync,
  version,
} from "../public/wasm/cellscript_wasm.js";

// Execute the distributed bundle itself. Native crate tests cannot detect a
// stale browser binary that still admits a removed source API.
initSync({ module: readFileSync(new URL("../public/wasm/cellscript_wasm_bg.wasm", import.meta.url)) });

const moduleName = "browser_byte_contract";
const action = (body) => `module ${moduleName}\naction inspect() -> u64 { verification\n${body}\nreturn 0 }`;

function reports(source, edition) {
  return [
    ["single source", JSON.parse(compile_metadata_json(source, edition, undefined))],
    ["diagnostics", JSON.parse(compile_metadata_json_diagnostics(source, edition, undefined))],
    ["source set", JSON.parse(compile_metadata_json_sources(
      JSON.stringify([{ path: "main.cell", source }]), "main.cell", edition, undefined,
    ))],
  ];
}

function accepted(source, edition) {
  for (const [entrypoint, result] of reports(source, edition)) {
    assert.equal(result.error, undefined, `${entrypoint}: ${JSON.stringify(result)}`);
    if (entrypoint !== "single source") assert.equal(result.error_count, 0, JSON.stringify(result));
    const metadata = entrypoint === "single source" ? result : result.metadata;
    assert.equal(metadata?.module, moduleName, entrypoint);
    assert.equal(metadata?.actions?.length, 1, entrypoint);
  }
}

function rejected(source, edition, expectedMessage) {
  for (const [entrypoint, result] of reports(source, edition)) {
    const message = entrypoint === "single source"
      ? result.error
      : result.diagnostics?.filter((item) => item.severity === "error").map((item) => item.message).join("\n");
    if (entrypoint !== "single source") {
      assert.equal(result.metadata, null, entrypoint);
      assert.ok(result.error_count > 0, `${entrypoint}: ${JSON.stringify(result)}`);
    }
    assert.equal(typeof message, "string", `${entrypoint}: compilation unexpectedly succeeded`);
    assert.match(message, expectedMessage, entrypoint);
  }
}

test("distributed compiler version matches generated example provenance", () => {
  const provenance = JSON.parse(readFileSync(new URL("../src/data/provenance.json", import.meta.url), "utf8"));
  const expected = new Set(Object.values(provenance).map((entry) => entry.compilerVersion));
  assert.equal(expected.size, 1, "generated examples must use one compiler version");
  assert.equal(version(), [...expected][0]);
});

const rawReads = [
  "witness::bytes32(source::input(0), 0)",
  "witness::lock_exact32(source::input(0))",
  "witness::input_type_exact32(source::input(0))",
  "witness::output_type_exact32(source::input(0))",
  "ckb::cell_data_bytes32(source::input(0), 0)",
  "ckb::cell_lock_args32(source::input(0))",
  "ckb::cell_type_args32(source::input(0))",
];
const retiredCalls = [
  "witness::raw(source::input(0))",
  "witness::lock(source::input(0))",
  "witness::input_type(source::input(0))",
  "witness::output_type(source::input(0))",
  "ckb::cell_data_hash_at(source::input(0), 0)",
  "ckb::cell_data_hash(source::input(0))",
  "ckb::cell_lock_args_hash(source::input(0))",
  "ckb::cell_type_args_hash(source::input(0))",
  "ckb::require_cell_lock_args_hash(source::input(0), Hash::zero())",
  "ckb::require_cell_type_args_hash(source::input(0), Hash::zero())",
  "ckb::require_cell_lock_args_prefix_hash(source::input(0), Hash::zero())",
  "ckb::require_cell_type_args_prefix_hash(source::input(0), Hash::zero())",
  "ckb::require_cell_lock_args_suffix_hash(source::input(0), Hash::zero())",
  "ckb::require_cell_type_args_suffix_hash(source::input(0), Hash::zero())",
];
const retiredFields = [
  ["witness::args(0)", "lock"],
  ["witness::args(0)", "input_type"],
  ["witness::args(0)", "output_type"],
  ["ckb::lock_script(source::input(0))", "args_hash"],
  ["ckb::type_script(source::input(0))", "args_hash"],
];

for (const edition of ["2026", "2027"]) {
  for (const read of rawReads) {
    test(`${edition}: exact read returns bytes: ${read}`, () => {
      accepted(action(`let value: [u8; 32] = ${read}\nrequire value == value`), edition);
      rejected(action(`let value: Hash = ${read}`), edition, /Hash/);
    });
  }
  for (const read of [
    "ckb::cell_data_hash_field(source::input(0))",
    "ckb::cell_data_blake2b_span(source::input(0), 0, 0)",
  ]) {
    test(`${edition}: actual digest remains Hash: ${read}`, () => {
      accepted(action(`let value: Hash = ${read}\nrequire value == value`), edition);
    });
  }
  test(`${edition}: bytes require explicit Hash construction and serialization`, () => {
    accepted(action('let bytes = b"01234567890123456789012345678901"\nlet value = Hash::from_bytes(bytes)\nrequire value.0 == bytes'), edition);
  });
  test(`${edition}: external delegation still requires a manifest binding`, () => {
    rejected(action("ckb::trusted_exec_cell_dep_u8_args(0, Hash::zero(), 0, 0, 0, 0, 0)"), edition, /no exact Cell.toml binding/);
  });
  test(`${edition}: trusted and undeclared delegation cannot be mixed`, () => {
    rejected(action("ckb::trusted_exec_cell_dep_u8_args(0, Hash::zero(), 0, 0, 0, 0, 0)\nckb::exec_cell_dep_u8_args(0, 0, 0, 0, 0, 0)"), edition, /mixes trusted and undeclared exec delegation/);
  });
  for (const call of retiredCalls) {
    test(`${edition}: retired call is rejected: ${call}`, () => {
      rejected(action(`let value = ${call}`), edition, /removed legacy byte-buffer API/);
    });
  }
  for (const [base, field] of retiredFields) {
    test(`${edition}: retired field is rejected: ${base}.${field}`, () => {
      rejected(action(`let view = ${base}\nlet value = view.${field}`), edition, /removed legacy byte-buffer field/);
    });
  }
}
