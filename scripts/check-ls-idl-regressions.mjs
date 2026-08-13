import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve(process.argv[2] || "dist");
const files = {
  browse: resolve(dist, "registry", "index.html"),
  interface: resolve(dist, "registry", "interface", "index.html"),
  api: resolve(dist, "registry", "api", "index.html"),
  lookup: resolve("src", "components", "RegistryLsIdlLookup.astro"),
  detail: resolve("src", "components", "RegistryPackageDetail.astro"),
  library: resolve("src", "lib", "registry.ts"),
  styles: resolve("src", "styles", "registry.css"),
};

for (const [name, file] of Object.entries(files)) {
  if (!existsSync(file)) throw new Error(`LS-IDL ${name} contract file is missing: ${file}`);
}

const browse = readFileSync(files.browse, "utf8");
const interfacePage = readFileSync(files.interface, "utf8");
const api = readFileSync(files.api, "utf8");
const lookup = readFileSync(files.lookup, "utf8");
const detail = readFileSync(files.detail, "utf8");
const library = readFileSync(files.library, "utf8");
const styles = readFileSync(files.styles, "utf8");

for (const [name, text, tokens] of [
  ["browse", browse, ["data-registry-browser", 'href="/registry/interface"', 'data-i18n="registry.nav.interface">LS-IDL']],
  ["interface", interfacePage, ["data-ls-idl-lookup", "data-ls-idl-data-hash-field hidden", "interfaces/ls-idl", "application/vnd.ckb.ls-idl+json", "x-ls-idl-verification", "schema-and-suffix-bound"]],
  ["API", api, ["/v1/ckb/scripts/:code_hash/interfaces/ls-idl", "/idl/:code_hash", "byte-preserving"]],
  ["detail", detail, ["data-package-ls-idl", "data-package-ls-idl-download", "lsIdlBoundary"]],
  ["library", library, ["cellscript-registry-ls-idl-interface-v1", "code-cell-data-suffix-32", "artifact ls-idl fetch"]],
]) {
  for (const token of tokens) {
    if (!text.includes(token)) throw new Error(`LS-IDL ${name} contract is missing: ${token}`);
  }
}

if (browse.includes("data-ls-idl-lookup")) {
  throw new Error("LS-IDL lookup must not compete with Registry browsing");
}
if (browse.includes("registry-browse-tools")) {
  throw new Error("The LS-IDL tab must not be repeated as a Browse-page utility row");
}
if (!/\.registry-tool-route\s*\{[^}]*width:\s*100%/s.test(styles) || /\.registry-tool-route\s*\{[^}]*max-width:/s.test(styles)) {
  throw new Error("The LS-IDL route must align to the full-width Browse surface");
}
if (interfacePage.includes("registry-ls-idl-disclosure") || interfacePage.includes("<details")) {
  throw new Error("The dedicated LS-IDL page must present one direct lookup surface");
}
if (!/data-ls-idl-submit[^>]*class="[^"]*primary/.test(interfacePage) && !/class="[^"]*primary[^"]*"[^>]*data-ls-idl-submit/.test(interfacePage)) {
  throw new Error("The dedicated LS-IDL lookup must expose one clear primary action");
}
if (!lookup.includes('hashTypeSelect.value === "type"') || !lookup.includes("dataHashField.hidden = !needsDataHash")) {
  throw new Error("LS-IDL data hash must be disclosed only for type-hash lookup");
}

console.log("LS-IDL website regression checks ok");
