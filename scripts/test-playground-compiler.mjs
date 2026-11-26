import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
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
    assert.equal(metadata.metadata_schema_version, 79, entrypoint);
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

test("distributed source contract matches authoring v9 and Unicode tables", () => {
  const contract = JSON.parse(source_language_contract_json());
  assert.equal(contract.schema, "cellscript-source-language-contract-v1");
  assert.equal(contract.edition, "2027");
  assert.equal(contract.source_semantics, "cellscript-source-semantics-2027-0.33-authoring-v9");
  assert.equal(contract.identifier_unicode_version, "17.0.0");
  assert.equal(contract.max_source_bytes, 1048576);
  assert.equal(contract.compiler_version, version());
});

test("actual playground worker loads the distributed compiler and compiles an explicit-source entry", async () => {
  const bytes = readFileSync(new URL("../public/wasm/cellscript_wasm_bg.wasm", import.meta.url));
  const artifact = JSON.parse(readFileSync(new URL("../src/data/compiler-artifact.json", import.meta.url), "utf8"));
  const workerSource = readFileSync(new URL("../public/playground-worker.js", import.meta.url), "utf8");
  const browserImport = "/wasm/cellscript_wasm.js";
  assert.equal(workerSource.split(browserImport).length, 2, "one actual browser module import is expected");
  // Adapt only the browser's absolute module URL for Node. The real worker,
  // distributed glue/WASM, asset integrity and contract handshake all execute.
  const source = workerSource.replace(browserImport, new URL("../public/wasm/cellscript_wasm.js", import.meta.url).href);
  let handler;
  let result;
  const self = {
    location: { href: `https://cellscript.test/playground-worker.js?v=${artifact.sha256}` },
    addEventListener(type, callback) { assert.equal(type, "message"); handler = callback; },
    postMessage(message) { result = message; },
  };
  const fetch = async (url) => {
    assert.equal(url, `/wasm/cellscript_wasm_bg.wasm?v=${artifact.sha256}`);
    return new Response(bytes);
  };
  new Function("self", "fetch", "crypto", source)(self, fetch, webcrypto);
  assert.equal(typeof handler, "function");
  await handler({ data: {
    id: 17, type: "compile",
    source: "module worker_contract; action verify(witness value: u64) { require value > 0; }",
  } });
  assert.equal(result?.type, "result", JSON.stringify(result));
  assert.equal(result.id, 17);
  assert.equal(result.payload.error_count, 0, JSON.stringify(result));
  assert.equal(result.payload.metadata.module, "worker_contract");
  assert.equal(result.payload.metadata.metadata_schema_version, 79);
});

test("distributed v9 compiler executes the shared native authoring corpus", () => {
  const positive = [
    "branch-fresh", "branch-retire", "branch-pool", "branch-pool-many",
    "branch-continue-retire", "branch-retire-consume", "branch-fresh-kernel",
    "branch-unique-retire", "receipt-claim-kernel", "settle-kernel",
    "branch-claim-fresh", "kernel-group-successor", "declared-identity",
    "absolute-fresh", "absolute-pool", "collection-stack-capacity", "named-unsigned-bounds",
    "aggregate-u128-conservation", "delimited-validity", "mutable-values-and-readonly-views",
  ];
  for (const name of positive) {
    const source = readFileSync(new URL(`../../tests/fixtures/authoring/${name}.cell`, import.meta.url), "utf8");
    // Test-only JSON supplies the same explicit artifact context as the native
    // fixture runner. No CellScript declaration or policy is reparsed here.
    const context = source.split("\n").find((line) => line.startsWith("// test-artifact: "));
    const inputs = [{ path: "main.cell", source }];
    if (context) {
      const { entry, layout } = JSON.parse(context.slice("// test-artifact: ".length));
      inputs.push({ path: "Cell.toml", source: `[package]
name = "shared-authoring"
version = "0.1.0"
edition = "2027"
cellscript_version = ">=0.33.0-alpha.1"
[[artifacts]]
name = "shared-authoring"
context = { kind = "type-group" }
bindings = "group-relative"
coverage = "fixed-group"
layout = ${JSON.stringify(layout)}
dispatch = "single-entry"
entry = ${JSON.stringify(entry)}
` });
    }
    const result = JSON.parse(compile_metadata_json_sources(JSON.stringify(inputs), "main.cell", "2027", undefined));
    assert.equal(result.error_count, 0, `${name}: ${JSON.stringify(result)}`);
    assert.ok(result.metadata, name);
    assert.equal(result.metadata.metadata_schema_version, 79, name);
    assert.equal(result.metadata.metadata_scope, "cellscript-browser-summary-v1", name);
  }
  for (const [name, message] of [
    ["flow-edge-terminator-reject", /semicolon|`;`|end with/],
    ["postfix-entry-source-reject", /E1032|prefix|postfix/],
    ["implicit-entry-source-reject", /E1032|explicit.*source|explicit.*provenance/],
    ["named-arrow-output-reject", /named Cell outputs|output name: Type/],
    ["fresh-identity-conflict-reject", /fresh rejected|identity/],
    ["named-unsigned-bound-overflow-reject", /exceeds its declared scalar type/],
    ["branch-entry-policy-reject", /every accepting path.*exactly once/],
    ["reserved-mutable-reference-reject", /references are reserved/],
    ["reserved-launch-reject", /launch is reserved/],
    ["unbraced-validity-reject", /validity requires an explicit braced region/],
  ]) {
    const source = readFileSync(new URL(`../../tests/syntax_combo/seeds/${name}.cell`, import.meta.url), "utf8");
    rejected(source, "2027", message);
  }
});

test("distributed builtin numeric-bound errors retain E2111", () => {
  const source = readFileSync(new URL("../../tests/fixtures/authoring/builtin-type-bound-reject.cell", import.meta.url), "utf8");
  for (const [entrypoint, result] of rejected(source, "2027", /unsigned integer literal or constant name/)) {
    if (entrypoint !== "single source") {
      assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "E2111"), `${entrypoint}: ${JSON.stringify(result)}`);
    }
  }
});

test("unknown editions reject across all browser compile entrypoints", () => {
  rejected(action("require true"), "2099", /unsupported.*2099.*2027/);
});

test("distributed nested specializations resolve qualified phantom arguments", () => {
  const source = readFileSync(new URL("../../tests/fixtures/nested_qualified_arguments.cell", import.meta.url), "utf8");
  for (const [entrypoint, result] of reports(source, "2027")) {
    assert.equal(result.error, undefined, `${entrypoint}: ${JSON.stringify(result)}`);
    if (entrypoint !== "single source") assert.equal(result.error_count, 0, JSON.stringify(result));
    const metadata = entrypoint === "single source" ? result : result.metadata;
    assert.equal(metadata.module, "nested_qualified_arguments");
  }
  rejected(source.replace("Envelope<nested_qualified_arguments::Value>", "Envelope<Other>"), "2027", /type mismatch/);
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
action retain(
        input before: Token,
        witness recipient: ScriptHash,
        output after: Token,
    ) {
        let observed = before.amount;
        require observed > 0;
        replace before -> after {
            data = same;
            lock = exact_hash(recipient);
            type_script = same;
            capacity = same;
        }
    }`;

test("distributed compiler accepts the unified group action and successor grammar", () => {
  const manifest = `[package]
name = "browser-group"
version = "0.1.0"
edition = "2027"

[[artifacts]]
name = "retain"
context = { kind = "type-group" }
bindings = "group-relative"
coverage = "fixed-group"
layout = "Token"
dispatch = "single-entry"
entry = "retain"
`;
  const result = JSON.parse(compile_metadata_json_sources(
    JSON.stringify([{ path: "main.cell", source: groupSuccessor }, { path: "Cell.toml", source: manifest }]),
    "main.cell", "2027", undefined,
  ));
  assert.equal(result.error_count, 0, JSON.stringify(result));
  assert.equal(result.metadata.actions[0].name, "retain");
  const manualManifest = manifest
    .replace('bindings = "group-relative"', 'bindings = "transaction-absolute"')
    .replace('coverage = "fixed-group"', 'coverage = "action-defined"')
    .replace('layout = "Token"\n', "");
  const manual = JSON.parse(compile_metadata_json_sources(
    JSON.stringify([{ path: "main.cell", source: groupSuccessor }, { path: "Cell.toml", source: manualManifest }]),
    "main.cell", "2027", undefined,
  ));
  assert.equal(manual.error_count, 0, JSON.stringify(manual));
  assert.equal(manual.metadata.actions[0].name, "retain");
  const exampleSource = (path) => readFileSync(new URL(`../../examples/semantic-foundation-2027/${path}`, import.meta.url), "utf8");
  const packaged = JSON.parse(compile_metadata_json_sources(
    JSON.stringify(["src/main.cell", "Cell.toml"].map((path) => ({ path, source: exampleSource(path) }))),
    "src/main.cell", "2027", undefined,
  ));
  assert.equal(packaged.error_count, 0, JSON.stringify(packaged));
  assert.equal(packaged.metadata.actions[0].name, "transfer");
  accepted(groupSuccessor, "2027");
});

test("distributed compiler rejects retired group condition and relation spellings", () => {
  for (const [source, diagnostic] of [
    [groupSuccessor.replace("action retain(", "type_script retain("), /type_script|unexpected/],
    [groupSuccessor.replace("input before: Token,", "entry before: Token,"), /expected ':'|unsupported.*entry/],
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
lock permit(protected wallet: Wallet) {
        let amount = wallet.amount;
        if amount > 0 { require amount == 7; } else { require false; }
        true
    }`;
  for (const [entrypoint, result] of reports(source, "2027")) {
    assert.equal(result.error, undefined, `${entrypoint}: ${JSON.stringify(result)}`);
    if (entrypoint !== "single source") assert.equal(result.error_count, 0, JSON.stringify(result));
    const metadata = entrypoint === "single source" ? result : result.metadata;
    assert.equal(metadata.metadata_schema_version, 79, entrypoint);
    assert.equal(metadata.module, moduleName, entrypoint);
    assert.equal(metadata.metadata_scope, "cellscript-browser-summary-v1", entrypoint);
    assert.deepEqual(metadata.actions, [], entrypoint);
  }
  rejected(source.replace("wallet.amount", "wallet.absent"), "2027", /absent|unknown field/);
  rejected(source.replace("lock permit", "lock_script permit"), "2027", /E1032|declaration was removed/);

  // The same source fixture is checked by the native Lock artifact owners.
  // Select the group explicitly; a declaration alone supplies no group proof.
  const shared = readFileSync(new URL("../../tests/fixtures/authoring/lock-artifact.cell", import.meta.url), "utf8");
  const manifest = `[package]
name = "browser-lock"
version = "0.1.0"
edition = "2027"
cellscript_version = ">=0.33.0-alpha.1"

[[artifacts]]
name = "vault-lock"
context = { kind = "lock-group" }
bindings = "group-relative"
coverage = "authorization-only"
dispatch = "single-entry"
entry = "unlock"
`;
  const selected = JSON.parse(compile_metadata_json_sources(
    JSON.stringify([{ path: "main.cell", source: shared }, { path: "Cell.toml", source: manifest }]),
    "main.cell", "2027", undefined,
  ));
  assert.equal(selected.error_count, 0, JSON.stringify(selected));
  assert.equal(selected.metadata.module, "lock_artifacts");
  assert.deepEqual(selected.metadata.actions, []);
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
