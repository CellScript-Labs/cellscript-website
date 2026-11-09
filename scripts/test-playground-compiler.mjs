import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { actionEffectFacts } from "../src/lib/effect-facts.mjs";
import {
  compile_metadata_json,
  compile_metadata_json_diagnostics,
  compile_metadata_json_sources,
  initSync,
  version,
  source_language_contract_json,
} from "../public/wasm/cellscript_wasm.js";

// Execute the distributed bundle itself. Native crate tests cannot detect a
// stale browser binary that still admits a removed source API.
initSync({ module: readFileSync(new URL("../public/wasm/cellscript_wasm_bg.wasm", import.meta.url)) });

const moduleName = "browser_byte_contract";
const action = (body) => `module ${moduleName};\naction inspect() -> u64 {\n${body};\nreturn 0; }`;

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
  const results = reports(source, edition);
  for (const [entrypoint, result] of results) {
    assert.equal(result.error, undefined, `${entrypoint}: ${JSON.stringify(result)}`);
    if (entrypoint !== "single source") assert.equal(result.error_count, 0, JSON.stringify(result));
    const metadata = entrypoint === "single source" ? result : result.metadata;
    assert.equal(metadata?.module, moduleName, entrypoint);
    assert.equal(metadata?.edition, "2027", entrypoint);
    assert.equal(metadata?.actions?.length, 1, entrypoint);
    assert.equal(metadata.metadata_schema_version, 76, entrypoint);
    actionEffectFacts(metadata.actions[0]);
  }
  return results;
}

function rejected(source, edition, expectedMessage) {
  const results = reports(source, edition);
  for (const [entrypoint, result] of results) {
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
  return results;
}

test("distributed source contract matches authoring v3 and Unicode tables", () => {
  const contract = JSON.parse(source_language_contract_json());
  assert.equal(contract.schema, "cellscript-source-language-contract-v1");
  assert.equal(contract.edition, "2027");
  assert.equal(contract.source_semantics, "cellscript-source-semantics-2027-0.33-authoring-v3");
  assert.equal(contract.identifier_unicode_version, "17.0.0");
  assert.equal(contract.max_source_bytes, 1048576);
  assert.equal(contract.compiler_version, version());
});

test("unknown editions reject across all browser compile entrypoints", () => {
  rejected(action("require true"), "2099", /unsupported.*2099.*2027/);
});

test("distributed compiler version matches generated example provenance", () => {
  const provenance = JSON.parse(readFileSync(new URL("../src/data/provenance.json", import.meta.url), "utf8"));
  const expected = new Set(Object.values(provenance).map((entry) => entry.compilerVersion));
  assert.equal(expected.size, 1, "generated examples must use one compiler version");
  assert.equal(version(), [...expected][0]);
});

test("the shipped pipe cleanup example describes endpoint lifecycle only", () => {
  const source = readFileSync(new URL("../../examples/language/ckb/multi_step_pipeline.cell", import.meta.url), "utf8");
  for (const edition of ["2027"]) {
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
  const source = `module ${moduleName};
resource Token has store { amount: u64 }
collections Work { limits { bytes: 512, allocations: 4 },
  values: Vec<u64> { items: 4 },
}
fn local(view: &Work) -> u64 { return view.values.get(0); }
fn observe() -> u64 { return ckb::input::<Token>(0).data.amount; }
action inspect() -> u64 {
  let mut work = Work::new();
  work.values.push(3);
  let value = local(&work);
  require observe() == value;
  return 0;
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

for (const edition of ["2027"]) {
  test(`${edition}: unfinished byte strings and unknown scheduler hints reject`, () => {
    for (const [source, code] of [
      [`module byte_eof;\nconst BYTE: [u8; 1] = b"x`, "E1022"],
      [`module byte_eof;\nconst BYTE: [u8; 1] = b"x${String.fromCharCode(92)}`, "E1023"],
      [`module ${moduleName};\n#[scheduler_hint(paralell)]\naction inspect() { require true; }`, "E1024"],
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
    for (const [entrypoint, result] of rejected(source, edition, /manifest-bound CellDep spawn/)) {
      if (entrypoint !== "single source") {
        assert.ok(result.diagnostics.some((item) => item.code === "E1021"), JSON.stringify(result));
      }
    }
    accepted(`module ${moduleName};\nfn spawn(value: u64) -> u64 { return value; }\naction inspect() -> u64 { return spawn(7); }`, edition);
  });
  test(`${edition}: oversized fixed layouts return source diagnostics in the shipped binary`, () => {
    for (const type of ["[u64; 4294967295]", "([u8; 4294967295], u8)"]) {
      const source = `module ${moduleName};\naction inspect(witness payload: ${type}) { }`;
      for (const [entrypoint, result] of reports(source, edition)) {
        if (entrypoint === "single source") {
          assert.equal(typeof result.error, "string", JSON.stringify(result));
        } else {
          assert.equal(result.metadata, null, JSON.stringify(result));
          assert.ok(result.diagnostics.some((item) => item.code === "E1020"), JSON.stringify(result));
        }
      }
    }
    accepted(`module ${moduleName};\naction inspect(witness payload: [u8; 32]) { require payload[0] == 7; }`, edition);
  });
  test(`${edition}: same-spelled foreign definitions retain their own facts`, () => {
    const sources = [
      { path: "main.cell", source: "module owner_labels;\npublic action send() -> u64 { return a::b::value(); }\npublic action local() -> u64 { return a__b::value(); }" },
      { path: "a/b.cell", role: "library", source: "module a::b;\npublic fn value() -> u64 { let status = pipe_write(0, 7); return 11; }" },
      { path: "a__b.cell", role: "library", source: "module a__b;\npublic fn value() -> u64 { return 22; }" },
    ];
    const report = JSON.parse(compile_metadata_json_sources(JSON.stringify(sources), "main.cell", edition, undefined));
    assert.equal(report.error_count, 0, JSON.stringify(report));
    const send = report.metadata.actions.find((action) => action.name === "send");
    const local = report.metadata.actions.find((action) => action.name === "local");
    assert.deepEqual(actionEffectFacts(send), { context_reads: [], lifecycle_ops: [], process_ops: ["pipe-write"] });
    assert.deepEqual(actionEffectFacts(local), { context_reads: [], lifecycle_ops: [], process_ops: [] });
  });
  test(`${edition}: context and process facts remain independent in the shipped binary`, () => {
    for (const [entrypoint, result] of reports(action("let amount = ckb::cell_capacity(source::input(0));\nlet sent = pipe_write(1, amount);\nrequire sent == 0"), edition)) {
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
      accepted(action(`let value: [u8; 32] = ${read};\nrequire value == value`), edition);
      rejected(action(`let value: Hash = ${read}`), edition, /Hash/);
    });
  }
  for (const read of [
    "ckb::cell_data_hash_field(source::input(0))",
    "ckb::cell_data_blake2b_span(source::input(0), 0, 0)",
  ]) {
    test(`${edition}: actual digest remains Hash: ${read}`, () => {
      accepted(action(`let value: Hash = ${read};\nrequire value == value`), edition);
    });
  }
  test(`${edition}: bytes require explicit Hash construction and serialization`, () => {
    accepted(action('let bytes = b"01234567890123456789012345678901";\nlet value = Hash::from_bytes(bytes);\nrequire value.0 == bytes'), edition);
  });
  test(`${edition}: external delegation still requires a manifest binding`, () => {
    rejected(action("ckb::trusted_exec_cell_dep_u8_args(0, Hash::zero(), 0, 0, 0, 0, 0)"), edition, /no exact Cell.toml binding/);
  });
  test(`${edition}: trusted and undeclared delegation cannot be mixed`, () => {
    rejected(action("ckb::trusted_exec_cell_dep_u8_args(0, Hash::zero(), 0, 0, 0, 0, 0);\nckb::exec_cell_dep_u8_args(0, 0, 0, 0, 0, 0)"), edition, /mixes trusted and undeclared exec delegation/);
  });
  for (const call of retiredCalls) {
    test(`${edition}: retired call is rejected: ${call}`, () => {
      rejected(action(`let value = ${call}`), edition, /removed legacy byte-buffer API/);
    });
  }
  for (const [base, field] of retiredFields) {
    test(`${edition}: retired field is rejected: ${base}.${field}`, () => {
      rejected(action(`let view = ${base};\nlet value = view.${field}`), edition, /removed legacy byte-buffer field/);
    });
  }
}

test("source labels never acquire verifier or PIPE contracts in distributed metadata", () => {
  for (const name of [
    "__novaseal_bip340_require_signature",
    "__novaseal_bip340_require_signature_from_cell_dep",
    "__zk_require_transition", "__ckb_pipe", "__ckb_sighash_all",
  ]) {
    const source = `module ${moduleName};
fn ${name}(value: u64) -> u64 { return 77; }
action inspect() -> u64 { return ${moduleName}::${name}(5); }`;
    for (const edition of ["2027"]) {
      for (const [entrypoint, result] of accepted(source, edition)) {
        const metadata = entrypoint === "single source" ? result : result.metadata;
        const facts = actionEffectFacts(metadata.actions[0]);
        assert.deepEqual(facts.context_reads, [], name);
        assert.deepEqual(facts.lifecycle_ops, [], name);
        assert.deepEqual(facts.process_ops, [], name);
        assert.deepEqual(metadata.runtime.zk_verifiers, [], name);
      }
    }
  }
});


const groupSuccessor = `module ${moduleName};
resource Token has store, replace, relock { amount: u64 }
type_script TokenPolicy on type_group<Token> {
    action retain(
        input before: Token from group_input[0],
        witness recipient: ScriptHash from group_witness.input_type,
        output after: Token from group_output[0],
    ) {
        let observed = before.amount;
        require observed > 0;
        replace before -> after {
            data = same except { };
            lock = exact_hash(recipient);
            type_script = same;
            capacity = same;
        }
    }
}`;

test("distributed compiler accepts the unified group action and successor grammar", () => {
  accepted(groupSuccessor, "2027");
});

test("distributed compiler rejects retired group condition and relation spellings", () => {
  for (const [source, diagnostic] of [
    [groupSuccessor.replace("action retain(", "entry retain("), /action|entry/],
    [groupSuccessor.replace("require observed > 0;", "verify { enforce observed > 0 }"), /verify|enforce|statement|expected/],
    [groupSuccessor.replace("type_script = same;", "identity = same;"), /identity|type_script/],
    [groupSuccessor.replace("lock = exact_hash", "lock_script = exact_hash"), /lock_script|lock/],
    [groupSuccessor.replace("capacity = same;", "capacity = same;\ncardinality = one_to_one;"), /cardinality/],
  ]) rejected(source, "2027", diagnostic);
});

test("distributed successor checks keep Type Script, Lock and capacity explicit", () => {
  for (const treatment of ["type_script = same;", "capacity = same;", "lock = exact_hash(recipient);"]) {
    rejected(groupSuccessor.replace(treatment, ""), "2027", /missing|must state/);
  }
  rejected(groupSuccessor.replace("recipient: ScriptHash", "recipient: Address"), "2027", /ScriptHash/);
});

test("distributed Lock group uses the ordinary lock and require grammar", () => {
  const source = `module ${moduleName};
resource Wallet has store { amount: u64 }
lock_script WalletPolicy on lock_group {
    lock permit(protected wallet: Wallet from group_input[0]) {
        let amount = wallet.amount;
        if amount > 0 { require amount == 7; } else { require false; }
        true
    }
}`;
  for (const [entrypoint, result] of reports(source, "2027")) {
    assert.equal(result.error, undefined, `${entrypoint}: ${JSON.stringify(result)}`);
    if (entrypoint !== "single source") assert.equal(result.error_count, 0, JSON.stringify(result));
    const metadata = entrypoint === "single source" ? result : result.metadata;
    assert.equal(metadata.metadata_schema_version, 76, entrypoint);
    assert.equal(metadata.module, moduleName, entrypoint);
    assert.equal(metadata.metadata_scope, "cellscript-browser-summary-v1", entrypoint);
    assert.deepEqual(metadata.actions, [], entrypoint);
  }
  rejected(source.replace("wallet.amount", "wallet.absent"), "2027", /absent|unknown field/);
});

// Exercise the UI's real source workspaces; TypeScript stripping is test setup.
test("every shipped example workspace compiles with its original module graph", async () => {
  const siteUrl = new URL("../src/data/site.ts", import.meta.url);
  const script = ts.transpileModule(readFileSync(siteUrl, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replaceAll("import.meta.url", JSON.stringify(siteUrl.href));
  const { exampleWorkspaces } = await import(`data:text/javascript;base64,${Buffer.from(script).toString("base64")}`);
  assert.equal(Object.keys(exampleWorkspaces).length, 18);
  for (const [name, files] of Object.entries(exampleWorkspaces)) {
    const entry = files.find((file) => file.role === "entry");
    const sources = files.map((file) => ({ ...file, role: file.role === "entry" ? "entry" : "library" }));
    const result = JSON.parse(compile_metadata_json_sources(JSON.stringify(sources), entry.path, "2027", undefined));
    assert.equal(result.error_count, 0, `${name}: ${JSON.stringify(result)}`);
    assert.equal(result.metadata.metadata_scope, "cellscript-browser-summary-v1", name);
    assert.equal(result.metadata.verified_lowering_record, undefined, name);
  }
});
