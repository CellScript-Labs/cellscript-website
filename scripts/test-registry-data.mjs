import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const temporary = mkdtempSync(join(tmpdir(), "cellscript-registry-data-"));
try {
  const source = join(temporary, "sources");
  const output = join(temporary, "catalog.json");
  mkdirSync(source);
  writeFileSync(output, JSON.stringify({ schema_version: 1, packages: [{ coordinate: "stale/package" }] }));
  const generate = () => spawnSync(process.execPath, [fileURLToPath(new URL("./generate-registry-data.mjs", import.meta.url))], {
    env: { ...process.env, CELLSCRIPT_REGISTRY_ROOT: source, CELLSCRIPT_REGISTRY_OUTPUT: output },
    encoding: "utf8",
  });

  const empty = generate();
  assert.equal(empty.status, 0, empty.stderr);
  const emptyCatalog = readFileSync(output, "utf8");
  assert.deepEqual(JSON.parse(emptyCatalog), {
    schema_version: 1,
    source: "registry.json + Cell.toml + Deployed.toml scan",
    packages: [],
  });
  assert.match(empty.stdout, /0 package\(s\)/);

  writeFileSync(join(source, "registry.json"), JSON.stringify({
    schema_version: 1,
    namespace: "test",
    name: "source",
    versions: [{
      version: "0.1.0", tag: "v0.1.0", source_hash: "1".repeat(64),
      cellscript_version: "0.33.0-alpha.2", edition: "2099",
      compatibility_profile_hash: "2".repeat(64), dependencies: {},
      status: "indexed_pending", yanked: false,
    }],
  }));
  const unknown = generate();
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /must use Edition 2027/);
  assert.equal(readFileSync(output, "utf8"), emptyCatalog, "invalid sources must not overwrite a valid catalog");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log("Registry data generation: empty catalog replaces stale data; unknown editions reject");
