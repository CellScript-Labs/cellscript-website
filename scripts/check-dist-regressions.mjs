import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createHash } from "node:crypto";

const failures = [];

const read = (path) => readFileSync(path, "utf-8");

const fail = (message) => {
  failures.push(message);
};

const expectFile = (path) => {
  if (!existsSync(path)) fail(`missing file: ${path}`);
};

const expectDir = (path) => {
  if (!existsSync(path)) fail(`missing directory: ${path}`);
};

const expectContains = (name, value, needle) => {
  if (!value.includes(needle)) fail(`${name}: missing ${needle}`);
};

const expectNotContains = (name, value, needle) => {
  if (value.includes(needle)) fail(`${name}: unexpected ${needle}`);
};

const countContains = (value, needle) => value.split(needle).length - 1;

const root = resolve(".");
const dist = resolve(root, "dist");
const distIndex = resolve(dist, "index.html");
const distDocsIndex = resolve(dist, "docs", "index.html");
const distPlaygroundIndex = resolve(dist, "playground", "index.html");
const distRegistryIndex = resolve(dist, "registry", "index.html");
const distRegistrySubmitIndex = resolve(dist, "registry", "submit", "index.html");
const distPlaygroundWorker = resolve(dist, "playground-worker.js");
const distWasm = resolve(dist, "wasm", "cellscript_wasm_bg.wasm");
const docsSource = resolve(root, "src", "lib", "docs.ts");
const wikiRoot = resolve(root, "..", "docs", "wiki");
const expectedReleaseTag = "v0.22.0";
const expectedCompilerAssetVersion = "20260731-v0.22.0-9bb2d765";
const expectedWasmSha256 = "1141d7227079d0585e61b09450331ee4a4791b0875ea2cae81b63219acd70530";

expectFile(distIndex);
expectFile(distDocsIndex);
expectFile(distPlaygroundIndex);
expectFile(distRegistryIndex);
expectFile(distRegistrySubmitIndex);
expectFile(distPlaygroundWorker);
expectFile(distWasm);
expectFile(docsSource);

const indexHtml = existsSync(distIndex) ? read(distIndex) : "";
const docsHtml = existsSync(distDocsIndex) ? read(distDocsIndex) : "";
const registryHtml = existsSync(distRegistryIndex) ? read(distRegistryIndex) : "";
const registrySubmitHtml = existsSync(distRegistrySubmitIndex) ? read(distRegistrySubmitIndex) : "";
const playgroundWorker = existsSync(distPlaygroundWorker) ? read(distPlaygroundWorker) : "";
const docsSourceText = existsSync(docsSource) ? read(docsSource) : "";

const cssDir = resolve(dist, "_astro");
const cssText = existsSync(cssDir)
  ? readdirSync(cssDir)
      .filter((file) => file.endsWith(".css"))
      .map((file) => read(resolve(cssDir, file)))
      .join("\n")
  : "";
const jsText = existsSync(cssDir)
  ? readdirSync(cssDir)
      .filter((file) => file.endsWith(".js"))
      .map((file) => read(resolve(cssDir, file)))
      .join("\n")
  : "";

if (!cssText) fail("dist/_astro: no generated CSS found");
if (!jsText) fail("dist/_astro: no generated JavaScript found");

expectContains("home", indexHtml, '<a class="hero-release-tag"');
expectContains("home", indexHtml, `href="https://github.com/CellScript-Labs/CellScript/releases/tag/${expectedReleaseTag}"`);
expectContains("home", indexHtml, `<strong>${expectedReleaseTag}</strong>`);
expectNotContains("home", indexHtml, '<div class="hero-release-tag"');
expectNotContains("home", indexHtml, "v0.20.0");

for (const [name, html] of [
  ["registry", registryHtml],
  ["registry submit", registrySubmitHtml],
]) {
  expectContains(name, html, ">Registry</h1>");
  expectContains(name, html, "Discover verified CellScript packages or publish a package with scoped CKB wallet authorisation.");
  expectContains(name, html, 'data-astro-transition-persist="registry-header"');
  expectContains(name, html, 'data-i18n-aria-label="nav.registryBrowse"');
}

const walletButton = registrySubmitHtml.match(/<button[^>]*data-capability-primary[^>]*>/)?.[0] ?? "";
if (!walletButton) fail("registry submit: missing primary wallet action");
else if (/\sdisabled(?:\s|=|>)/.test(walletButton)) fail("registry submit: primary wallet action must be enabled before package coordinates are entered");

for (const wallet of [
  "Neuron",
  "JoyID",
  "imToken",
  "CKBull",
  "SafePal",
  "Ledger",
  "imKey",
  "OneKey",
  "UTXO Global",
  "Rei Wallet",
  "Gate",
  "QuantumPurse",
]) {
  expectContains("registry wallet bundle", jsText, wallet);
}
expectContains("registry wallet bundle", jsText, "external_signature");
expectContains("registry wallet bundle", jsText, "wallet-signature.json");
expectContains("registry wallet bundle", jsText, "/wallets/");

for (const icon of [
  "neuron.svg",
  "joyid.svg",
  "imtoken.svg",
  "ckbull.svg",
  "safepal.svg",
  "ledger.svg",
  "imkey.svg",
  "onekey.svg",
  "utxoglobal.svg",
  "reiwallet.svg",
  "gate.svg",
  "quantumpurse.svg",
]) {
  expectFile(resolve(dist, "wallets", icon));
  expectContains("registry wallet bundle", jsText, `\"${icon.replace(".svg", "")}\"`);
}

for (const stage of ["wallet", "scope", "authorise"]) {
  expectContains("registry submit", registrySubmitHtml, `data-workflow-stage="${stage}"`);
}
for (const retiredStage of ["payload", "signature", "capability", "namespace"]) {
  expectNotContains("registry submit", registrySubmitHtml, `data-workflow-stage="${retiredStage}"`);
}
expectContains("registry submit", registrySubmitHtml, 'form="registry-submit-form"');
expectContains("registry submit", registrySubmitHtml, 'data-publish-step data-state="locked" aria-labelledby="registry-publish-heading" hidden');

expectContains("playground bundle", jsText, expectedCompilerAssetVersion);
expectContains("playground bundle", jsText, 'cellscript_version = "0.22.0"');
expectNotContains("playground bundle", jsText, 'cellscript_version = "0.20.0-rc.1"');
expectContains("playground worker", playgroundWorker, `const COMPILER_ASSET_VERSION = "${expectedCompilerAssetVersion}"`);

if (existsSync(distWasm)) {
  const wasmSha256 = createHash("sha256").update(readFileSync(distWasm)).digest("hex");
  if (wasmSha256 !== expectedWasmSha256) {
    fail(`playground WASM: expected SHA-256 ${expectedWasmSha256}, found ${wasmSha256}`);
  }
}

const valueCopyCount = countContains(indexHtml, "value-card-copy");
if (valueCopyCount < 3) fail(`home: expected at least 3 value-card-copy layers, found ${valueCopyCount}`);

const exampleCopyCount = countContains(indexHtml, "landing-example-copy");
if (exampleCopyCount < 4) fail(`home: expected at least 4 landing-example-copy layers, found ${exampleCopyCount}`);

for (const token of [
  "--image-caption-bg",
  ".hero-release-tag:hover",
  ".value-card-copy",
  ".landing-example-copy",
  "@media(max-width:840px)",
  ".theme-toggle,.language-toggle,.nav-link{width:44px;min-width:44px;padding:0}",
  "text-shadow:none",
  "text-wrap:normal",
]) {
  expectContains("generated CSS", cssText, token);
}

const newDocSlugs = [
  "tutorial-09-action-model-and-canonical-syntax",
  "tutorial-13-agentic-loops-and-cellscript-mcp",
];

const oldDocSlugs = [
  "tutorial-09-action-model-and-0-13-syntax",
  "tutorial-13-agentic-loops-and-cellc-mcp",
];

for (const slug of newDocSlugs) {
  expectDir(resolve(dist, "docs", slug));
  expectContains("docs index", docsHtml, `/docs/${slug}/`);
}

for (const slug of oldDocSlugs) {
  if (existsSync(resolve(dist, "docs", slug))) fail(`dist/docs: stale generated slug ${slug}`);
  expectNotContains("docs index", docsHtml, slug);
  expectNotContains("home", indexHtml, slug);
}

const orderChecks = [
  [
    "/docs/tutorial-03-resources-and-cell-effects/",
    "/docs/tutorial-09-action-model-and-canonical-syntax/",
    "/docs/tutorial-10-standard-library/",
  ],
  [
    "/docs/tutorial-13-agentic-loops-and-cellscript-mcp/",
    "/docs/ckb-glossary/",
  ],
];

for (const chain of orderChecks) {
  let previous = -1;
  for (const href of chain) {
    const next = docsHtml.indexOf(href);
    if (next === -1) {
      fail(`docs index: missing ordered href ${href}`);
      continue;
    }
    if (previous !== -1 && next <= previous) {
      fail(`docs index: ${href} appears out of order in ${chain.join(" -> ")}`);
      break;
    }
    previous = next;
  }
}

const docsOrderMatch = docsSourceText.match(/const docsOrder = \[([\s\S]*?)\] as const;/);
if (!docsOrderMatch) {
  fail("src/lib/docs.ts: could not find docsOrder");
} else {
  const docsOrder = [...docsOrderMatch[1].matchAll(/"([^"]+\.md)"/g)].map((match) => match[1]);
  for (const file of docsOrder) {
    if (existsSync(wikiRoot) && !existsSync(resolve(wikiRoot, file))) {
      fail(`src/lib/docs.ts: docsOrder entry does not exist in docs/wiki: ${file}`);
    }
  }
  for (const stale of [
    "Tutorial-09-Action-Model-and-0-13-Syntax.md",
    "Tutorial-13-Agentic-Loops-and-cellc-mcp.md",
  ]) {
    if (docsOrder.includes(stale)) fail(`src/lib/docs.ts: stale docsOrder entry ${stale}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `dist regressions ok (${basename(distIndex)}, ${newDocSlugs.length} renamed docs, ${valueCopyCount} value layers, ${exampleCopyCount} example layers)`,
);
