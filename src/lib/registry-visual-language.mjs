export const registryFacetStates = [
  "ready",
  "chain_verified",
  "verified",
  "source_only",
  "needs_evidence",
  "deprecated",
];

export function registryEvidenceDepth(pkg) {
  if (pkg.deployment_status === "chain_verified") return 4;
  if (pkg.verification_status === "verified") return 3;
  if (pkg.verification_status === "hash_bound") return 2;
  if (pkg.verification_status === "pending") return 1;
  return 0;
}

export function registryEvidenceDescriptionKey(pkg) {
  if (pkg.deployment_status === "chain_verified") return "evidenceChainVerified";
  if (pkg.verification_status === "verified") return "evidenceVerified";
  if (pkg.verification_status === "hash_bound") return "evidenceHashBound";
  if (pkg.verification_status === "pending") return "evidencePending";
  if (pkg.verification_status === "rejected") return "evidenceRejected";
  return "evidenceRequired";
}

export function registryFacetState(pkg, guidance) {
  if (guidance.usageState === "deprecated") return "deprecated";
  if (guidance.usageState === "unavailable") return null;
  if (pkg.deployment_status === "chain_verified") return "chain_verified";
  if (guidance.usageState === "ready") return "ready";
  if (pkg.verification_status === "verified") return "verified";
  if (guidance.usageState === "source_only" || guidance.usageState === "hash_bound") return "source_only";
  if (guidance.usageState === "needs_evidence") return "needs_evidence";
  return null;
}

export function registryPackageMatchesFacet(pkg, guidance, facet) {
  return !facet || registryFacetState(pkg, guidance) === facet;
}

/**
 * @param {Array<any>} packages
 * @param {(pkg: any) => any} guidanceFor
 * @param {{ intent?: string, nextOffset?: number | null, minPackages?: number }} [options]
 */
export function registryFacetSummary(packages, guidanceFor, options = {}) {
  const { intent = "", nextOffset, minPackages = 6 } = options;
  if (intent || nextOffset !== null || packages.length < minPackages) return [];

  const counts = new Map();
  for (const pkg of packages) {
    const state = registryFacetState(pkg, guidanceFor(pkg));
    if (state) counts.set(state, (counts.get(state) || 0) + 1);
  }

  const summary = registryFacetStates
    .map((state) => ({ state, count: counts.get(state) || 0 }))
    .filter(({ count }) => count > 0);
  return summary.length >= 2 ? summary : [];
}
