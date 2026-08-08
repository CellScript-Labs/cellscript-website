import assert from "node:assert/strict";
import {
  mayUseAggregateDeployments,
  registryEvidenceForRelease,
  selectRegistryRelease,
} from "../src/lib/registry-release.mjs";

const releases = [
  { release: "2.0.0", evidence: [{ version: "2.0.0", kind: "verified_build" }] },
  { release: "1.0.0", evidence: [{ version: "1.0.0", kind: "deployed" }] },
];

assert.equal(selectRegistryRelease(releases, "2.0.0")?.release, "2.0.0");
assert.equal(selectRegistryRelease(releases, "2.0.0", "1.0.0")?.release, "1.0.0");
assert.equal(selectRegistryRelease(releases, "2.0.0", "missing")?.release, "2.0.0");
assert.deepEqual(registryEvidenceForRelease(releases[1], [], releases.length), releases[1].evidence);

const aggregate = [
  { version: "2.0.0", kind: "verified_build" },
  { version: "1.0.0", kind: "deployed" },
  { kind: "on_chain_committed" },
];
assert.deepEqual(
  registryEvidenceForRelease({ release: "1.0.0", evidence: [] }, aggregate, 2),
  [aggregate[1]],
);
assert.deepEqual(
  registryEvidenceForRelease({ release: "1.0.0", evidence: [] }, [{ kind: "deployed" }], 2),
  [],
  "unversioned aggregate evidence must not leak into a historical release",
);
assert.deepEqual(
  registryEvidenceForRelease({ release: "1.0.0", evidence: [] }, [{ kind: "deployed" }], 1),
  [{ kind: "deployed" }],
);
assert.equal(mayUseAggregateDeployments(releases[0], "2.0.0", 2), true);
assert.equal(mayUseAggregateDeployments(releases[1], "2.0.0", 2), false);

console.log("registry release selection and evidence isolation ok");
