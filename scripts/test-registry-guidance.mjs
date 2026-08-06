import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import ts from "typescript";

const sourceUrl = new URL("../src/lib/registry-guidance.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
  fileName: sourceUrl.pathname,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { deriveArtifactGuidance } = await import(moduleUrl);

const base = {
  availabilityStatus: "active",
  verificationStatus: "verified",
  deploymentStatus: "not_applicable",
  consumptionMode: "dependency",
  installCommand: "cellc install acme/pkg@1.0.0",
  consumerCommand: "cellc artifact pin acme/pkg@1.0.0",
  recordUrl: "https://registry.example/acme/pkg/1.0.0.json",
  maintainUrl: "/registry/manage?package=acme%2Fpkg",
};

const cases = [
  {
    name: "verified dependency is ready to install",
    input: {},
    expected: { usageState: "ready", summaryKey: "ready", consumerKind: "install" },
  },
  {
    name: "yanked availability overrides otherwise verified state",
    input: { availabilityStatus: "yanked" },
    expected: { usageState: "unavailable", summaryKey: "unavailable", consumerKind: "review" },
  },
  {
    name: "deprecated availability stays distinct from yanked",
    input: { availabilityStatus: "deprecated" },
    expected: { usageState: "deprecated", summaryKey: "deprecated", consumerKind: "review" },
  },
  {
    name: "verification rejection blocks consumption and points maintainers to a new release",
    input: { verificationStatus: "rejected" },
    expected: { usageState: "unavailable", summaryKey: "verificationRejected", consumerKind: "review", maintainerKind: "resolve_verification", task: "publish" },
  },
  {
    name: "pending verification asks consumers to refresh without inventing a maintainer task",
    input: { verificationStatus: "pending" },
    expected: { usageState: "needs_evidence", summaryKey: "verificationPending", consumerKind: "refresh" },
  },
  {
    name: "reproducibility evidence gap points maintainers to evidence tooling",
    input: { verificationStatus: "evidence_required" },
    expected: { usageState: "needs_evidence", summaryKey: "evidenceRequired", consumerKind: "review", maintainerKind: "add_reproducibility", task: "reproduce" },
  },
  {
    name: "hash-bound artifacts remain usable only under an explicit trust boundary",
    input: { verificationStatus: "hash_bound", consumptionMode: "copy" },
    expected: { usageState: "hash_bound", summaryKey: "hashBound", consumerKind: "fetch" },
  },
  {
    name: "verified undeployed contract exposes bytes while keeping deployment as maintainer work",
    input: { consumptionMode: "deployment", deploymentStatus: "undeployed" },
    expected: { usageState: "source_only", summaryKey: "sourceOnly", consumerKind: "fetch", maintainerKind: "record_deployment", task: "deployment" },
  },
  {
    name: "recorded deployment still needs current-network chain verification",
    input: { consumptionMode: "deployment", deploymentStatus: "deployed" },
    expected: { usageState: "source_only", summaryKey: "sourceOnly", consumerKind: "fetch", maintainerKind: "verify_chain", task: "live" },
  },
  {
    name: "chain-verified contract produces a CellDep action",
    input: { consumptionMode: "deployment", deploymentStatus: "chain_verified" },
    expected: { usageState: "ready", summaryKey: "ready", consumerKind: "cell_dep" },
  },
];

for (const testCase of cases) {
  const result = deriveArtifactGuidance({ ...base, ...testCase.input });
  assert.equal(result.usageState, testCase.expected.usageState, `${testCase.name}: usage state`);
  assert.equal(result.summaryKey, testCase.expected.summaryKey, `${testCase.name}: summary`);
  assert.equal(result.consumerAction.kind, testCase.expected.consumerKind, `${testCase.name}: consumer action`);
  assert.equal(result.maintainerAction?.kind, testCase.expected.maintainerKind, `${testCase.name}: maintainer action`);
  if (testCase.expected.task) {
    assert.match(result.maintainerAction?.value ?? "", new RegExp(`[?&]task=${testCase.expected.task}(?:&|$)`), `${testCase.name}: task URL`);
  }
}

console.log(`registry guidance: ${cases.length} cases passed`);
