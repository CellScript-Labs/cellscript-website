#!/usr/bin/env node
/** Regenerate website build-time data from live `cellc` output. */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { jsonWithAsciiEscapes } from "./ascii-json.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CELLC = resolve(REPO, "target/release/cellc");
const EXAMPLES = resolve(REPO, "examples");
const DATA_DIR = resolve(REPO, "website/src/data");
const PROVENANCE_OUT = resolve(DATA_DIR, "provenance.json");
const FRAGMENTS_OUT = resolve(DATA_DIR, "pipeline-fragments.json");
const ASSURANCE_OUT = resolve(DATA_DIR, "assurance-metadata.json");
const HERO_EXAMPLES = { token: "token.cell", nft: "nft.cell", amm: "amm_pool.cell", vesting: "vesting.cell" };
const PIPELINE_EXAMPLE = "token";
const SOURCE_LINES = 8;
const AST_LINES = 24;
const ASM_LINES = 28;
const ELF_HEX_LINES = 8;

function repoRelative(candidate) {
  return relative(REPO, candidate).split(sep).join("/");
}

function run(program, args) {
  const result = spawnSync(program, args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`command failed (${result.status}): ${program} ${args.join(" ")}\n${result.stderr || result.stdout}`);
    error.status = result.status;
    throw error;
  }
  return result.stdout;
}

function runCellc(args) {
  return run(CELLC, args);
}

function runMetadata(exampleFile) {
  return JSON.parse(runCellc(["metadata", resolve(EXAMPLES, exampleFile), "--target-profile", "ckb"]));
}

function collectGlobalTypeNames(metadatas) {
  const names = new Map();
  for (const metadata of metadatas) {
    for (const type of metadata.types || []) {
      for (const key of ["hash_type_source", "hash"]) {
        if (type[key] && type.name) names.set(type[key], type.name);
      }
    }
  }
  names.set("a2fb2f9b3990cd9b473352ff466d94a720c6a8c56ce9e014536872ea71c808d1", "Token");
  return names;
}

function simplifySet(entries, paramsByBinding, typeNames) {
  return (entries || []).map((entry) => {
    const binding = entry.binding ?? null;
    return {
      op: entry.operation ?? null,
      type: entry.ty || typeNames.get(entry.type_hash) || paramsByBinding.get(binding) || "Cell",
      binding,
    };
  });
}

function buildProvenanceView(metadata, typeNames) {
  const actions = (metadata.actions || []).map((action) => {
    const params = new Map((action.params || []).map((param) => [param.name, param.ty]));
    return {
      name: action.name ?? null,
      effectClass: action.effect_class ?? null,
      consume: simplifySet(action.consume_set, params, typeNames),
      create: simplifySet(action.create_set, params, typeNames),
      estimatedCycles: action.estimated_cycles ?? null,
      parallelizable: action.parallelizable ?? null,
    };
  });
  return {
    module: metadata.module ?? null,
    target: "ckb",
    artifactSizeBytes: metadata.artifact_size_bytes ?? null,
    artifactHash: (metadata.artifact_hash || "").slice(0, 16),
    sourceHash: (metadata.source_hash || "").slice(0, 16),
    compilerVersion: metadata.compiler_version ?? null,
    types: (metadata.types || []).map((type) => ({
      name: type.name ?? null,
      kind: type.kind ?? null,
      capabilities: type.capabilities || [],
      encodedSize: type.encoded_size ?? null,
      flowStates: type.flow_states || [],
    })),
    actions,
  };
}

function writeJson(candidate, value) {
  writeFileSync(candidate, `${jsonWithAsciiEscapes(value)}\n`, "utf8");
}

function generateProvenance() {
  const metadatas = [];
  for (const filename of Object.values(HERO_EXAMPLES)) {
    const candidate = resolve(EXAMPLES, filename);
    if (!existsSync(candidate)) throw new Error(`${candidate} not found`);
    metadatas.push(runMetadata(filename));
  }
  const typeNames = collectGlobalTypeNames(metadatas);
  const provenance = Object.fromEntries(
    Object.keys(HERO_EXAMPLES).map((exampleId, index) => [exampleId, buildProvenanceView(metadatas[index], typeNames)]),
  );
  writeJson(PROVENANCE_OUT, provenance);
  console.log(`wrote ${repoRelative(PROVENANCE_OUT)} (${statSync(PROVENANCE_OUT).size} bytes)`);
  for (const [exampleId, view] of Object.entries(provenance)) {
    console.log(`  ${exampleId}: ${view.types.length} types, ${view.actions.length} actions, ${view.artifactSizeBytes} bytes`);
  }
  return provenance;
}

function generatePipelineFragments(tempDirectory) {
  const examplePath = resolve(EXAMPLES, HERO_EXAMPLES[PIPELINE_EXAMPLE]);
  const source = readFileSync(examplePath, "utf8").split("\n").slice(0, SOURCE_LINES).join("\n").trimEnd();
  const ast = runCellc(["--parse", examplePath]).split("\n").slice(1, 1 + AST_LINES).join("\n").trimEnd();
  const metadata = runMetadata(HERO_EXAMPLES[PIPELINE_EXAMPLE]);
  const metaExcerpt = {
    module: metadata.module ?? null,
    artifact_format: metadata.artifact_format ?? null,
    types: (metadata.types || []).slice(0, 3).map((type) => ({ name: type.name ?? null, kind: type.kind ?? null })),
    actions: (metadata.actions || []).slice(0, 3).map((action) => ({ name: action.name ?? null, effect: action.effect_class ?? null })),
  };
  const metadataJson = JSON.stringify(metaExcerpt, null, 2);

  const asmPath = resolve(tempDirectory, "pipeline.asm");
  runCellc(["-t", "riscv64-asm", examplePath, "-o", asmPath]);
  const riscv = readFileSync(asmPath, "utf8").split("\n").slice(0, ASM_LINES).join("\n").trimEnd();
  unlinkSync(asmPath);
  unlinkSync(`${asmPath}.meta.json`);

  const elfPath = resolve(tempDirectory, "pipeline.elf");
  runCellc(["-t", "riscv64-elf", examplePath, "-o", elfPath]);
  const elfSize = statSync(elfPath).size;
  const elfHex = run("xxd", [elfPath]).split("\n").slice(0, ELF_HEX_LINES).join("\n").trimEnd();
  unlinkSync(elfPath);
  unlinkSync(`${elfPath}.meta.json`);
  const elf = `ELF64 RISC-V · ${elfSize.toLocaleString("en-US")} bytes\n\n${elfHex}`;
  const fragments = { source, ast, metadata: metadataJson, riscv, elf };
  writeJson(FRAGMENTS_OUT, fragments);
  console.log(`\nwrote ${repoRelative(FRAGMENTS_OUT)} (${statSync(FRAGMENTS_OUT).size} bytes)`);
  for (const [stage, content] of Object.entries(fragments)) console.log(`  ${stage}: ${content.split("\n").length} lines`);
  return fragments;
}

function generateAssuranceExcerpt() {
  const metadata = runMetadata(HERO_EXAMPLES.vesting);
  const excerpt = {
    metadata_schema_version: metadata.metadata_schema_version ?? null,
    module: metadata.module ?? null,
    target_profile: metadata.target_profile?.name || "ckb",
    types: (metadata.types || []).slice(0, 4).map((type) => ({
      name: type.name ?? null,
      kind: type.kind ?? null,
      capabilities: type.capabilities || [],
    })),
    actions: (metadata.actions || []).slice(0, 3).map((action) => ({
      name: action.name ?? null,
      effect_class: action.effect_class ?? null,
      consume_set: (action.consume_set || []).map((entry) => entry.binding ?? "?"),
      create_set: (action.create_set || []).map((entry) => entry.binding ?? "?"),
      estimated_cycles: action.estimated_cycles ?? null,
    })),
    artifact_format: metadata.artifact_format ?? null,
  };
  writeJson(ASSURANCE_OUT, excerpt);
  console.log(`\nwrote ${repoRelative(ASSURANCE_OUT)} (${statSync(ASSURANCE_OUT).size} bytes)`);
  console.log(`  module: ${excerpt.module}`);
  console.log(`  types: ${excerpt.types.length}, actions: ${excerpt.actions.length}`);
  return excerpt;
}

if (!existsSync(CELLC)) {
  console.error(`error: ${CELLC} not found. Run \`cargo build --release --bin cellc\` first.`);
  process.exit(1);
}

mkdirSync(DATA_DIR, { recursive: true });
const temporary = mkdtempSync(resolve(tmpdir(), "cellscript-website-data-"));
try {
  console.log("=== Generating provenance.json ===");
  generateProvenance();
  console.log("\n=== Generating pipeline-fragments.json ===");
  generatePipelineFragments(temporary);
  console.log("\n=== Generating assurance-metadata.json ===");
  generateAssuranceExcerpt();
  console.log("\nDone. All website data regenerated from live cellc output.");
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exitCode = error.status || 1;
} finally {
  rmdirSync(temporary);
}
