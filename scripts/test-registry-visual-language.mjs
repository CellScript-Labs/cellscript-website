import assert from "node:assert/strict";
import {
  registryEvidenceDepth,
  registryEvidenceDescriptionKey,
  registryFacetState,
  registryFacetSummary,
  registryPackageMatchesFacet,
} from "../src/lib/registry-visual-language.mjs";

const pkg = (verification_status, deployment_status = "undeployed") => ({ verification_status, deployment_status });
const guidance = (usageState) => ({ usageState });

assert.equal(registryEvidenceDepth(pkg("evidence_required")), 0);
assert.equal(registryEvidenceDepth(pkg("pending")), 1);
assert.equal(registryEvidenceDepth(pkg("hash_bound")), 2);
assert.equal(registryEvidenceDepth(pkg("verified")), 3);
assert.equal(registryEvidenceDepth(pkg("verified", "chain_verified")), 4);
assert.equal(registryEvidenceDescriptionKey(pkg("rejected")), "evidenceRejected");
assert.equal(registryEvidenceDescriptionKey(pkg("verified", "chain_verified")), "evidenceChainVerified");

assert.equal(registryFacetState(pkg("verified"), guidance("ready")), "ready");
assert.equal(registryFacetState(pkg("verified", "chain_verified"), guidance("ready")), "chain_verified");
assert.equal(registryFacetState(pkg("verified"), guidance("source_only")), "verified");
assert.equal(registryFacetState(pkg("hash_bound"), guidance("hash_bound")), "source_only");
assert.equal(registryFacetState(pkg("verified"), guidance("unavailable")), null);
assert.equal(registryPackageMatchesFacet(pkg("verified"), guidance("source_only"), "verified"), true);
assert.equal(registryPackageMatchesFacet(pkg("verified"), guidance("source_only"), "source_only"), false);

const packages = [
  { ...pkg("verified"), guidance: guidance("ready") },
  { ...pkg("verified"), guidance: guidance("ready") },
  { ...pkg("verified"), guidance: guidance("source_only") },
  { ...pkg("hash_bound"), guidance: guidance("hash_bound") },
  { ...pkg("evidence_required"), guidance: guidance("needs_evidence") },
  { ...pkg("verified", "chain_verified"), guidance: guidance("ready") },
];
const guidanceFor = (entry) => entry.guidance;

assert.deepEqual(registryFacetSummary(packages, guidanceFor, { nextOffset: 50 }), []);
assert.deepEqual(registryFacetSummary(packages, guidanceFor, { intent: "ready", nextOffset: null }), []);
assert.deepEqual(registryFacetSummary(packages.slice(0, 5), guidanceFor, { nextOffset: null }), []);
assert.deepEqual(registryFacetSummary(packages, guidanceFor, { nextOffset: null }), [
  { state: "ready", count: 2 },
  { state: "chain_verified", count: 1 },
  { state: "verified", count: 1 },
  { state: "source_only", count: 1 },
  { state: "needs_evidence", count: 1 },
]);
assert.deepEqual(registryFacetSummary(
  Array.from({ length: 6 }, () => ({ ...pkg("verified"), guidance: guidance("ready") })),
  guidanceFor,
  { nextOffset: null },
), []);

console.log("registry visual-language tests passed");
