import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { actionEffectFacts } from "../src/lib/effect-facts.mjs";
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
    assert.equal(metadata.metadata_schema_version, 74, entrypoint);
    actionEffectFacts(metadata.actions[0]);
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

test("the shipped pipe cleanup example describes endpoint lifecycle only", () => {
  const source = readFileSync(new URL("../../examples/language/ckb/multi_step_pipeline.cell", import.meta.url), "utf8");
  for (const edition of ["2026", "2027"]) {
    for (const [entrypoint, result] of reports(source, edition)) {
      assert.equal(result.error, undefined, JSON.stringify(result));
      if (entrypoint !== "single source") assert.equal(result.error_count, 0, JSON.stringify(result));
      const metadata = entrypoint === "single source" ? result : result.metadata;
      assert.equal(metadata.actions.length, 1);
      assert.equal(metadata.actions[0].name, "pipe_cleanup");
      assert.deepEqual(actionEffectFacts(metadata.actions[0]), {
        context_reads: [], lifecycle_ops: [], process_ops: ["close", "pipe-create"],
      });
    }
  }
});

test("allocated helper results preserve subsequent context observations", () => {
  const source = `module ${moduleName}
resource Token has store { amount: u64 }
collections Work { limits { bytes: 512, allocations: 4 }
  values: Vec<u64> { items: 4 }
}
fn local(view: &Work) -> u64 { return view.values.get(0) }
fn observe() -> u64 { return ckb::input<Token>(0).data.amount }
action inspect() -> u64 {
  let mut work = Work::new()
  work.values.push(3)
  let value = local(&work)
  require observe() == value
  return 0
}`;
  for (const [entrypoint, result] of reports(source, "2027")) {
    assert.equal(result.error, undefined, JSON.stringify(result));
    const metadata = entrypoint === "single source" ? result : result.metadata;
    assert.deepEqual(actionEffectFacts(metadata.actions[0]), {
      context_reads: [{ source: { kind: "input" }, access: "cell-data" }],
      lifecycle_ops: [], process_ops: [],
    });
  }
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
  test(`${edition}: unfinished byte strings and unknown scheduler hints reject`, () => {
    for (const [source, code] of [
      [`module byte_eof\nconst BYTE: [u8; 1] = b"x`, "E1022"],
      [`module byte_eof\nconst BYTE: [u8; 1] = b"x${String.fromCharCode(92)}`, "E1023"],
      [`module ${moduleName}\n#[scheduler_hint(paralell)]\naction inspect() { verification require true }`, "E1024"],
    ]) {
      for (const [entrypoint, result] of reports(source, edition)) {
        if (entrypoint === "single source") {
          assert.equal(typeof result.error, "string", JSON.stringify(result));
        } else {
          assert.equal(result.metadata, null, JSON.stringify(result));
          assert.ok(result.diagnostics.some((item) => item.code === code), JSON.stringify(result));
        }
      }
    }
  });
  test(`${edition}: bare named spawn is rejected before browser metadata`, () => {
    const source = action('spawn("hash_checker")');
    rejected(source, edition, /manifest-bound CellDep spawn/);
    for (const [entrypoint, result] of reports(source, edition)) {
      if (entrypoint !== "single source") {
        assert.ok(result.diagnostics.some((item) => item.code === "E1021"), JSON.stringify(result));
      }
    }
    accepted(`module ${moduleName}\nfn spawn(value: u64) -> u64 { return value }\naction inspect() -> u64 { verification return spawn(7) }`, edition);
  });
  test(`${edition}: oversized fixed layouts return source diagnostics in the shipped binary`, () => {
    for (const type of ["[u64; 4294967295]", "([u8; 4294967295], u8)"]) {
      const source = `module ${moduleName}\naction inspect(witness payload: ${type}) { verification }`;
      for (const [entrypoint, result] of reports(source, edition)) {
        if (entrypoint === "single source") {
          assert.equal(typeof result.error, "string", JSON.stringify(result));
        } else {
          assert.equal(result.metadata, null, JSON.stringify(result));
          assert.ok(result.diagnostics.some((item) => item.code === "E1020"), JSON.stringify(result));
        }
      }
    }
    accepted(`module ${moduleName}\naction inspect(witness payload: [u8; 32]) { verification require payload[0] == 7 }`, edition);
  });
  test(`${edition}: same-spelled foreign definitions retain their own facts`, () => {
    const sources = [
      { path: "main.cell", source: "module owner_labels\npublic action send() -> u64 { verification return a::b::value() }\npublic action local() -> u64 { verification return a__b::value() }" },
      { path: "a/b.cell", role: "library", source: "module a::b\npublic fn value() -> u64 { let status = pipe_write(0, 7) return 11 }" },
      { path: "a__b.cell", role: "library", source: "module a__b\npublic fn value() -> u64 { return 22 }" },
    ];
    const report = JSON.parse(compile_metadata_json_sources(JSON.stringify(sources), "main.cell", edition, undefined));
    assert.equal(report.error_count, 0, JSON.stringify(report));
    const send = report.metadata.actions.find((action) => action.name === "send");
    const local = report.metadata.actions.find((action) => action.name === "local");
    assert.deepEqual(actionEffectFacts(send), { context_reads: [], lifecycle_ops: [], process_ops: ["pipe-write"] });
    assert.deepEqual(actionEffectFacts(local), { context_reads: [], lifecycle_ops: [], process_ops: [] });
  });
  test(`${edition}: context and process facts remain independent in the shipped binary`, () => {
    for (const [entrypoint, result] of reports(action("let amount = ckb::cell_capacity(source::input(0))\nlet sent = pipe_write(1, amount)\nrequire sent == 0"), edition)) {
      assert.equal(result.error, undefined, JSON.stringify(result));
      const metadata = entrypoint === "single source" ? result : result.metadata;
      assert.deepEqual(actionEffectFacts(metadata.actions[0]), {
        context_reads: [{ source: { kind: "input" }, access: "capacity" }],
        lifecycle_ops: [], process_ops: ["pipe-write"],
      });
    }
  });
  for (const retired of ["Pure", "ReadOnly", "Creating", "Destroying", "Mutating"]) {
    test(`${edition}: retired declaration rejects: ${retired}`, () => {
      rejected(action("require true").replace("action inspect", `#[effect(${retired})]\naction inspect`), edition, /effect/);
    });
  }
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
