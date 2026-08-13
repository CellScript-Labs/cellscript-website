import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = {
  browse: resolve("dist", "registry", "index.html"),
  api: resolve("dist", "registry", "api", "index.html"),
  detail: resolve("src", "components", "RegistryPackageDetail.astro"),
  library: resolve("src", "lib", "registry.ts"),
};

for (const [name, file] of Object.entries(files)) {
  if (!existsSync(file)) throw new Error(`LS-IDL ${name} contract file is missing: ${file}`);
}

const browse = readFileSync(files.browse, "utf8");
const api = readFileSync(files.api, "utf8");
const detail = readFileSync(files.detail, "utf8");
const library = readFileSync(files.library, "utf8");

for (const [name, text, tokens] of [
  ["browse", browse, ["data-ls-idl-lookup", "interfaces/ls-idl", "application/vnd.ckb.ls-idl+json", "x-ls-idl-verification", "schema-and-suffix-bound"]],
  ["API", api, ["/v1/ckb/scripts/:code_hash/interfaces/ls-idl", "/idl/:code_hash", "byte-preserving"]],
  ["detail", detail, ["data-package-ls-idl", "data-package-ls-idl-download", "lsIdlBoundary"]],
  ["library", library, ["cellscript-registry-ls-idl-interface-v1", "code-cell-data-suffix-32", "artifact ls-idl fetch"]],
]) {
  for (const token of tokens) {
    if (!text.includes(token)) throw new Error(`LS-IDL ${name} contract is missing: ${token}`);
  }
}

console.log("LS-IDL website regression checks ok");
