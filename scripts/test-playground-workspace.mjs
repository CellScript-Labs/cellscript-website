import assert from "node:assert/strict";
import { parse } from "smol-toml";
import {
  PLAYGROUND_CELLSCRIPT_VERSION,
  PLAYGROUND_EDITION,
  buildPlaygroundCellToml,
  parsePlaygroundCellTomlEntry,
} from "../src/lib/playground-workspace.mjs";

const manifestText = buildPlaygroundCellToml("src/main.cell");
const manifest = parse(manifestText);

assert.deepEqual(manifest.package, {
  name: "playground",
  version: "0.1.0",
  edition: PLAYGROUND_EDITION,
  cellscript_version: PLAYGROUND_CELLSCRIPT_VERSION,
  entry: "src/main.cell",
  source_roots: ["src"],
});
assert.equal(PLAYGROUND_EDITION, "2026");
assert.equal(parsePlaygroundCellTomlEntry(manifestText), "src/main.cell");
assert.equal(
  parsePlaygroundCellTomlEntry("entry = 'src/nested/main.cell'", (value) => value.replace(/^src\//, "")),
  "nested/main.cell",
);
assert.equal(parsePlaygroundCellTomlEntry("[package]\nname = 'missing-entry'"), "");

console.log("playground workspace manifest contract ok");
