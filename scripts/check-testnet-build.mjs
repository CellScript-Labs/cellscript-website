import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const registry = await readFile(path.join(root, "dist-testnet/registry/index.html"), "utf8");
const submit = await readFile(path.join(root, "dist-testnet/registry/submit/index.html"), "utf8");
const apiOrigin = process.env.PUBLIC_REGISTRY_API_ORIGIN || "https://api.testnet.registry.cellscript.dev";

for (const [label, html] of [["Registry", registry], ["Submit", submit]]) {
  for (const required of [
    'data-registry-environment="testnet-sandbox"',
    'data-registry-network="testnet"',
    'name="robots" content="noindex,nofollow,noarchive"',
    "Pudge Testnet Sandbox",
    apiOrigin,
  ]) {
    if (!html.includes(required)) throw new Error(`${label} testnet build is missing ${required}`);
  }
}

try {
  await access(path.join(root, "dist-testnet/registry/package/dob/evolving-dob-profile-v1/index.html"));
  throw new Error("testnet build leaked a bundled non-testnet Registry package route");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log("testnet Registry build contract ok");
