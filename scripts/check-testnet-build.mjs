import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist-testnet");
const apiOrigin = process.env.PUBLIC_REGISTRY_API_ORIGIN || "https://api.testnet.registry.cellscript.dev";
const routes = new Map([
  ["Browse", ["registry/index.html", "data-registry-browser", true]],
  ["Publish", ["registry/submit/index.html", "data-publish-entry", true]],
  ["LS-IDL", ["registry/LS-IDL/index.html", "data-ls-idl-lookup", true]],
  ["API", ["registry/api/index.html", "registry-api-endpoints", true]],
  ["Manage", ["registry/manage/index.html", "data-manage-app", false]],
  ["Artifact detail", ["registry/package/index.html", "data-package-detail", true]],
]);

for (const [label, [relativePath, routeMarker, showsTabs]] of routes) {
  const html = await readFile(path.join(dist, relativePath), "utf8");
  const requiredTokens = [
    'data-registry-environment="testnet-sandbox"',
    'data-registry-network="testnet"',
    'name="robots" content="noindex,nofollow,noarchive"',
    "data-registry-hero",
    "registry-network-card",
    "Pudge Testnet Sandbox",
    "Ephemeral records · hidden after 72 hours · test CKB only",
    apiOrigin,
    'href="/registry"',
    routeMarker,
  ];
  if (showsTabs) requiredTokens.push('href="/registry/submit"', 'href="/registry/LS-IDL"', 'href="/registry/api"');
  for (const required of requiredTokens) {
    if (!html.includes(required)) throw new Error(`${label} testnet build is missing ${required}`);
  }
}

const lookup = await readFile(path.join(dist, "registry/LS-IDL/index.html"), "utf8");
if (!/<option value="testnet" selected>testnet<\/option>/.test(lookup)) {
  throw new Error("testnet LS-IDL lookup must default to the testnet network");
}

const api = await readFile(path.join(dist, "registry/api/index.html"), "utf8");
if (!api.includes("interfaces/ls-idl?network=testnet&amp;hash_type=data1")) {
  throw new Error("testnet API examples must target the testnet network");
}

const manage = await readFile(path.join(dist, "registry/manage/index.html"), "utf8");
if (manage.includes('<option value="dob/evolving-dob-profile-v1"') || !manage.includes("<h1 data-manage-title>namespace/artifact</h1>")) {
  throw new Error("testnet Manage must not embed production Registry packages");
}

try {
  await access(path.join(dist, "registry/package/dob/evolving-dob-profile-v1/index.html"));
  throw new Error("testnet build leaked a bundled non-testnet Registry package route");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log("testnet Registry build contract ok");
