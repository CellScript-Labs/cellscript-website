export const PLAYGROUND_CELLSCRIPT_VERSION = "0.22.0";
export const PLAYGROUND_EDITION = "2026";

const cleanManifestString = (value) => String(value ?? "").replaceAll('"', "");

export function buildPlaygroundCellToml(entry) {
  return `[package]
name = "playground"
version = "0.1.0"
edition = "2026"
cellscript_version = "0.22.0"
entry = "${cleanManifestString(entry)}"
source_roots = ["src"]
`;
}

export function parsePlaygroundCellTomlEntry(text, normalisePath = (value) => value) {
  const match = String(text ?? "").match(/^\s*entry\s*=\s*["']([^"']+)["']/m);
  return match?.[1] ? normalisePath(match[1]) : "";
}
