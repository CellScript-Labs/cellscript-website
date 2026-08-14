import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const productionRoot = path.resolve(root, process.argv[2] || "dist");
const testnetRoot = path.resolve(root, process.argv[3] || "dist-testnet");

const routes = new Map([
  ["registry/index.html", [["data-registry-browser", "data-registry-query", "data-registry-filter-menu", "data-registry-empty"], true]],
  ["registry/submit/index.html", [["registry-flow", "data-publish-entry", "data-authorisation-session", "data-submit-form"], true]],
  ["registry/interface/index.html", [["registry-tool-route", "data-ls-idl-lookup", "data-ls-idl-form", "data-ls-idl-result"], true]],
  ["registry/api/index.html", [["registry-api", "registry-api-endpoints", "registry-api-example"], true]],
  ["registry/manage/index.html", [["registry-maintainer", "data-manage-app", "data-manage-form", "data-manage-command"], false]],
  ["registry/package/index.html", [["registry-package-detail", "data-package-detail", "data-package-loading", "data-package-error"], true]],
]);

const sharedShell = [
  'id="registry-main"',
  "registry-environment-bar",
  'href="/registry"',
];
const tabShell = [
  'href="/registry/submit"',
  'href="/registry/interface"',
  'href="/registry/api"',
  'data-i18n="registry.nav.browse"',
  'data-i18n="registry.nav.submit"',
  'data-i18n="registry.nav.interface"',
  'data-i18n="registry.nav.api"',
];

const requireToken = (html, token, label) => {
  if (!html.includes(token)) throw new Error(`${label} is missing shared Registry contract token: ${token}`);
};

const assetReferences = (html) => [...new Set(
  [...html.matchAll(/(?:src|href)="(\/_astro\/[^"]+)"/g)].map((match) => match[1]),
)].sort();

for (const [relativePath, [routeTokens, showsTabs]] of routes) {
  const [production, testnet] = await Promise.all([
    readFile(path.join(productionRoot, relativePath), "utf8"),
    readFile(path.join(testnetRoot, relativePath), "utf8"),
  ]);
  requireToken(production, 'data-registry-environment="production"', `${relativePath} production`);
  requireToken(production, 'data-registry-network="mainnet"', `${relativePath} production`);
  requireToken(testnet, 'data-registry-environment="testnet-sandbox"', `${relativePath} testnet`);
  requireToken(testnet, 'data-registry-network="testnet"', `${relativePath} testnet`);
  for (const token of [...sharedShell, ...(showsTabs ? tabShell : []), ...routeTokens]) {
    requireToken(production, token, `${relativePath} production`);
    requireToken(testnet, token, `${relativePath} testnet`);
  }
  const productionAssets = JSON.stringify(assetReferences(production));
  const testnetAssets = JSON.stringify(assetReferences(testnet));
  if (productionAssets !== testnetAssets) {
    throw new Error(`${relativePath} loads different visual or interactive assets between production and testnet`);
  }
}

const listAssets = async (directory, prefix = "") => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listAssets(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files.sort();
};

const productionAssets = await listAssets(path.join(productionRoot, "_astro"));
const testnetAssets = await listAssets(path.join(testnetRoot, "_astro"));
if (JSON.stringify(productionAssets) !== JSON.stringify(testnetAssets)) {
  throw new Error("production and testnet generated different Registry asset inventories");
}

for (const relativePath of productionAssets) {
  const [production, testnet] = await Promise.all([
    readFile(path.join(productionRoot, "_astro", relativePath)),
    readFile(path.join(testnetRoot, "_astro", relativePath)),
  ]);
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  if (digest(production) !== digest(testnet)) {
    throw new Error(`generated asset differs between production and testnet: ${relativePath}`);
  }
}

const [productionLookup, testnetLookup, productionApi, testnetApi] = await Promise.all([
  readFile(path.join(productionRoot, "registry/interface/index.html"), "utf8"),
  readFile(path.join(testnetRoot, "registry/interface/index.html"), "utf8"),
  readFile(path.join(productionRoot, "registry/api/index.html"), "utf8"),
  readFile(path.join(testnetRoot, "registry/api/index.html"), "utf8"),
]);
requireToken(productionLookup, '<option value="mainnet" selected>mainnet</option>', "production LS-IDL lookup");
requireToken(testnetLookup, '<option value="testnet" selected>testnet</option>', "testnet LS-IDL lookup");
requireToken(productionApi, "interfaces/ls-idl?network=mainnet&amp;hash_type=data1", "production API example");
requireToken(testnetApi, "interfaces/ls-idl?network=testnet&amp;hash_type=data1", "testnet API example");

console.log(`Registry environment parity ok (${routes.size} routes, ${productionAssets.length} byte-identical assets)`);
