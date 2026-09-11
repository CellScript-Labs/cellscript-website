import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

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

const expectAnyContains = (name, value, needles) => {
  if (!needles.some((needle) => value.includes(needle))) {
    fail(`${name}: missing one of ${needles.join(", ")}`);
  }
};

const expectNotContains = (name, value, needle) => {
  if (value.includes(needle)) fail(`${name}: unexpected ${needle}`);
};

const countContains = (value, needle) => value.split(needle).length - 1;

const root = resolve(".");
const dist = resolve(root, "dist");
const distIndex = resolve(dist, "index.html");
const dist404 = resolve(dist, "404.html");
const distDocsIndex = resolve(dist, "docs", "index.html");
const distPlaygroundIndex = resolve(dist, "playground", "index.html");
const distRegistryIndex = resolve(dist, "registry", "index.html");
const distRegistrySubmitIndex = resolve(dist, "registry", "submit", "index.html");
const distRegistryApiIndex = resolve(dist, "registry", "api", "index.html");
const distRegistryInterfaceIndex = resolve(dist, "registry", "LS-IDL", "index.html");
const distRegistryManageIndex = resolve(dist, "registry", "manage", "index.html");
const distPlaygroundWorker = resolve(dist, "playground-worker.js");
const distWasm = resolve(dist, "wasm", "cellscript_wasm_bg.wasm");
const docsSource = resolve(root, "src", "lib", "docs.ts");
const registrySubmitSource = resolve(root, "src", "pages", "registry", "submit.astro");
const registryBrowseSource = resolve(root, "src", "pages", "registry.astro");
const registryLayoutSource = resolve(root, "src", "layouts", "RegistryLayout.astro");
const registryPackageDetailSource = resolve(root, "src", "components", "RegistryPackageDetail.astro");
const siteHeaderSource = resolve(root, "src", "components", "SiteHeader.astro");
const wikiRoot = resolve(root, "..", "docs", "wiki");
const expectedReleaseTag = "v0.24.0";
const expectedCompilerAssetVersion = "20260911-v0.26.0-82e76c02";
const expectedWasmSha256 = "82e76c029af7647fa206684e023fc95abdfd8e15ea6ce12e8993edb75da91b3b";

expectFile(distIndex);
expectFile(dist404);
expectFile(distDocsIndex);
expectFile(distPlaygroundIndex);
expectFile(distRegistryIndex);
expectFile(distRegistrySubmitIndex);
expectFile(distRegistryApiIndex);
expectFile(distRegistryInterfaceIndex);
expectFile(distRegistryManageIndex);
expectFile(distPlaygroundWorker);
expectFile(distWasm);
expectFile(docsSource);
expectFile(registrySubmitSource);
expectFile(registryBrowseSource);
expectFile(registryLayoutSource);
expectFile(registryPackageDetailSource);
expectFile(siteHeaderSource);

const indexHtml = existsSync(distIndex) ? read(distIndex) : "";
const notFoundHtml = existsSync(dist404) ? read(dist404) : "";
const docsHtml = existsSync(distDocsIndex) ? read(distDocsIndex) : "";
const playgroundHtml = existsSync(distPlaygroundIndex) ? read(distPlaygroundIndex) : "";
const registryHtml = existsSync(distRegistryIndex) ? read(distRegistryIndex) : "";
const registrySubmitHtml = existsSync(distRegistrySubmitIndex) ? read(distRegistrySubmitIndex) : "";
const registryApiHtml = existsSync(distRegistryApiIndex) ? read(distRegistryApiIndex) : "";
const registryInterfaceHtml = existsSync(distRegistryInterfaceIndex) ? read(distRegistryInterfaceIndex) : "";
const registryManageHtml = existsSync(distRegistryManageIndex) ? read(distRegistryManageIndex) : "";
const playgroundWorker = existsSync(distPlaygroundWorker) ? read(distPlaygroundWorker) : "";
const docsSourceText = existsSync(docsSource) ? read(docsSource) : "";
const registrySubmitSourceText = existsSync(registrySubmitSource) ? read(registrySubmitSource) : "";
const registryBrowseSourceText = existsSync(registryBrowseSource) ? read(registryBrowseSource) : "";
const registryLayoutSourceText = existsSync(registryLayoutSource) ? read(registryLayoutSource) : "";
const registryPackageDetailSourceText = existsSync(registryPackageDetailSource) ? read(registryPackageDetailSource) : "";
const siteHeaderSourceText = existsSync(siteHeaderSource) ? read(siteHeaderSource) : "";

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
expectContains("404", notFoundHtml, "/registry/package/");
expectContains("404", notFoundHtml, 'target.searchParams.set("namespace"');
expectContains("404", notFoundHtml, 'target.searchParams.set("name"');

for (const [name, html] of [
  ["home", indexHtml],
  ["404", notFoundHtml],
  ["docs", docsHtml],
  ["playground", playgroundHtml],
  ["registry", registryHtml],
  ["registry submit", registrySubmitHtml],
  ["registry interface", registryInterfaceHtml],
]) {
  expectContains(name, html, 'data-theme="light"');
  expectContains(name, html, "data-astro-rerun");
  expectContains(name, html, "cellscript-theme");
}

for (const [name, html, eyebrow, heading, description] of [
  ["registry", registryHtml, "Discover", "Find CKB artifacts you can inspect and use.", "Search packages, deployed Scripts, reproducible builds and templates, then open the evidence behind each release."],
  ["registry submit", registrySubmitHtml, "Publish", "Move a checked artifact into the Registry.", "Start in cellc, approve one scoped permission with your CKB wallet, and let the CLI finish the release."],
  ["registry interface", registryInterfaceHtml, "Lock Script interface", "Resolve LS-IDL from a deployed Script.", "Fetch the exact interface bytes bound to a CKB code hash and verify the executable's SHA-256 suffix commitment."],
  ["registry api", registryApiHtml, "Developer API", "Read Registry evidence through one stable API.", "Query artifacts, releases, deployments and LS-IDL without a wallet; use scoped authorisation only for writes."],
]) {
  expectContains(name, html, `>${eyebrow}</span>`);
  expectContains(name, html, `>${heading}</h1>`);
  expectContains(name, html, description);
  expectContains(name, html, "data-registry-hero");
  expectContains(name, html, "registry-network-card");
  expectContains(name, html, "Persistent, production-facing records");
  expectNotContains(name, html, 'data-astro-transition-persist="registry-header"');
  expectContains(name, html, 'data-astro-transition-persist="registry-environment"');
  expectContains(name, html, 'data-astro-transition-persist="registry-tabs"');
  expectContains(name, html, 'data-i18n-aria-label="nav.registryBrowse"');
}

expectContains("registry interface", registryInterfaceHtml, 'data-registry-title-key="registry.nav.interface"');
expectContains("registry interface", registryInterfaceHtml, 'data-i18n="registry.nav.interface">LS-IDL');
expectNotContains("registry interface", registryInterfaceHtml, "registry-tool-back");
const interfaceTab = registryInterfaceHtml.match(/<a[^>]*href="\/registry\/LS-IDL"[^>]*>/)?.[0] ?? "";
if (!interfaceTab.includes('class="active"') || !interfaceTab.includes('aria-current="page"')) {
  fail("registry interface: LS-IDL tab must be the only active route affordance");
}

expectContains("registry", registryHtml, 'data-registry-title-key="registry.nav.browse"');
expectContains("registry submit", registrySubmitHtml, 'data-registry-title-key="registry.nav.submit"');
expectContains("registry api", registryApiHtml, 'data-registry-title-key="registry.nav.api"');
expectNotContains("registry submit", registrySubmitHtml, 'id="registry-publish-entry-title"');
expectNotContains("registry api", registryApiHtml, 'id="registry-api-title"');
expectContains("registry api", registryApiHtml, 'class="registry-api-group-heading"');
const registryStylesheets = (html) => [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)]
  .map((match) => match[1])
  .sort();
const registryStyleSignature = JSON.stringify(registryStylesheets(registryHtml));
if (registryStyleSignature !== JSON.stringify(registryStylesheets(registrySubmitHtml))) {
  fail("registry submit: stylesheet set differs from Registry");
}
if (registryStyleSignature !== JSON.stringify(registryStylesheets(registryApiHtml))) {
  fail("registry API: stylesheet set differs from Registry");
}
if (registryStyleSignature !== JSON.stringify(registryStylesheets(registryInterfaceHtml))) {
  fail("registry interface: stylesheet set differs from Registry");
}

for (const action of ["connect", "sign", "submit", "claim"]) {
  const actionButton = registrySubmitHtml.match(new RegExp(`<button[^>]*data-capability-action="${action}"[^>]*>`))?.[0] ?? "";
  if (!actionButton) fail(`registry submit: missing ${action} capability action`);
  else if (!/\shidden(?:\s|=|>)/.test(actionButton)) fail(`registry submit: ${action} action must be progressive`);
}
expectNotContains("registry submit", registrySubmitHtml, "data-capability-primary");
expectNotContains("registry submit", registrySubmitHtml, "data-capability-network");
expectNotContains("registry submit", registrySubmitHtml, "data-submit-workspace");
for (const [name, html] of [
  ["registry submit", registrySubmitHtml],
  ["registry manage", registryManageHtml],
]) {
  const patterns = [...html.matchAll(/\spattern="([^"]*)"/g)].map((match) => match[1]);
  if (patterns.some((pattern) => pattern.includes("[a-z0-9_-]"))) {
    fail(`${name}: HTML pattern contains an unescaped Unicode-v hyphen`);
  }
}
expectContains("registry submit", registrySubmitHtml, "data-submit-form novalidate");
expectContains("registry submit", registrySubmitHtml, "data-publish-entry");
expectContains("registry submit", registrySubmitHtml, "cellc publish --authorise");
expectContains("registry submit", registrySubmitHtml, "data-open-manual-publish");
expectContains("registry submit", registrySubmitHtml, "data-manual-publish hidden");
expectContains("registry submit", registrySubmitHtml, 'data-authorisation-session data-state="loading" hidden');
expectContains("registry submit", registrySubmitHtml, 'data-session-stage="local" data-state="complete"');
expectContains("registry submit", registrySubmitHtml, "data-session-retry");
if (registrySubmitHtml.indexOf("data-publish-entry") > registrySubmitHtml.indexOf("data-submit-form")) {
  fail("registry submit: the session-first entry must precede the advanced manual form");
}
expectContains("registry submit", registrySubmitHtml, 'data-authorisation-mode="new"');
expectContains("registry submit", registrySubmitHtml, 'data-authorisation-mode="existing"');
expectContains("registry submit", registrySubmitHtml, "data-submit-create-capability");
expectContains("registry submit", registrySubmitHtml, "data-existing-capability-check");
expectContains("registry submit", registrySubmitHtml, "entering a key ID alone never unlocks anything.");
expectContains("registry submit bundle", jsText, "/v1/capabilities/");
expectContains("registry submit bundle", jsText, "/check?");
expectContains("registry submit bundle", jsText, "--capability-key-id");
expectContains("registry submit", registrySubmitHtml, "This cellc session can continue only through CKB connectors detected in this browser.");
expectContains("registry submit source", registrySubmitSourceText, "if (!authorisationSessionMode && directory.length)");
expectContains("registry submit source", registrySubmitSourceText, "await completeAuthorisationSession();");
expectContains("registry submit source", registrySubmitSourceText, "? !authorisationSessionMode && newMode && signatureReady");
expectContains("registry submit source", registrySubmitSourceText, "readAuthorisationSession(window.location.href, sessionStorage)");
expectContains("registry submit source", registrySubmitSourceText, "clearAuthorisationSession(sessionStorage, authorisationSessionId)");
expectContains("registry submit source", registrySubmitSourceText, "clearStoredAuthorisationSession();");
expectContains("registry submit source", registrySubmitSourceText, "const setupSubmitPage = () =>");
expectContains("registry submit source", registrySubmitSourceText, 'document.addEventListener("astro:page-load", setupSubmitPage)');
expectContains("registry submit source", registrySubmitSourceText, "registrySubmitDraftFieldNames");
expectContains("registry submit source", registrySubmitSourceText, "response = await attempt(6_500)");
expectContains("registry submit source", registrySubmitSourceText, "response = await attempt(4_000)");
expectContains("registry submit source", registrySubmitSourceText, "clearSignature(true)");
expectContains("registry submit source", registrySubmitSourceText, "Preserve an unchanged signed request");
expectContains("registry submit", registrySubmitHtml, "data-workflow-guide");
expectContains("registry source", registryBrowseSourceText, "/v1/artifacts");
expectNotContains("registry", registryHtml, "/v1/packages");
expectContains("registry", registryHtml, 'data-state="loading" data-source="loading"');
expectContains("registry", registryHtml, 'data-registry-skeleton aria-hidden="true" hidden');
expectContains("registry", registryHtml, 'data-registry-empty role="status" aria-live="polite" aria-atomic="true"');
expectContains("registry", registryHtml, "data-registry-empty-submit");
expectContains("registry", registryHtml, 'href="/registry/LS-IDL"');
expectContains("registry", registryHtml, ">Browse</span>");
expectContains("registry", registryHtml, ">LS-IDL</span>");
expectNotContains("registry", registryHtml, "registry-index-strip");
expectNotContains("registry", registryHtml, "registry-cell-blueprint");
expectNotContains("registry", registryHtml, "registry-browse-tools");
expectContains("registry", registryHtml, "data-registry-clear");
expectContains("registry", registryHtml, "data-registry-intent");
expectContains("registry", registryHtml, "data-registry-filter-trigger");
expectContains("registry", registryHtml, "data-registry-filter-menu");
expectContains("registry", registryHtml, "Any use state");
expectContains("registry source", registryBrowseSourceText, "const setViewState");
expectContains("registry source", registryBrowseSourceText, "__cellscriptRegistryBrowseCache");
expectContains("registry source", registryBrowseSourceText, "const SKELETON_DELAY_MS = 250");
expectContains("registry source", registryBrowseSourceText, "const PRIMARY_DEADLINE_MS = 5400");
expectContains("registry source", registryBrowseSourceText, "const RETRY_DEADLINE_MS = 1900");
expectContains("registry source", registryBrowseSourceText, "requestGeneration");
expectContains("registry source", registryBrowseSourceText, "showTerminalFailure");
expectContains("registry source", registryBrowseSourceText, "registryBrowseStateUrl");
expectContains("registry source", registryBrowseSourceText, "matchesIntent");
expectContains("registry source", registryBrowseSourceText, "closeFilterMenus");
expectContains("registry source", registryBrowseSourceText, '["ArrowDown", "ArrowUp", "Home", "End"]');
expectContains("registry source", registryBrowseSourceText, 'document.addEventListener("astro:page-load", setupRegistryBrowse)');
expectContains("registry source", registryBrowseSourceText, 'search.set("availability", "deprecated")');
expectContains("registry layout", registryLayoutSourceText, 'transition:name="registry-header"');
expectContains("registry layout", registryLayoutSourceText, 'document.addEventListener("astro:after-swap", syncRegistryShell)');
expectContains("registry layout", registryLayoutSourceText, 'tabs.dataset.indicatorReady = "true"');
expectContains("registry package detail", registryPackageDetailSourceText, "const setupRegistryPackageDetail = () =>");
expectContains("registry package detail", registryPackageDetailSourceText, 'document.addEventListener("astro:page-load", setupRegistryPackageDetail)');
expectContains("registry package detail", registryPackageDetailSourceText, "renderGuidanceText();\n    load();");
expectContains("registry package detail", registryPackageDetailSourceText, "data-package-guidance");
expectContains("registry package detail", registryPackageDetailSourceText, "data-package-maintainer-action");
expectContains("registry package detail", registryPackageDetailSourceText, "openEvidenceJson");
expectContains("registry manage", registryManageHtml, "data-manage-current-title");
expectContains("registry manage", registryManageHtml, "data-manage-task-menu");
expectContains("registry CSS", cssText, "::view-transition-old(registry-route)");
expectContains("registry CSS", cssText, "::view-transition-new(registry-route)");
expectContains("registry CSS", cssText, "::view-transition-old(registry-header)");
expectContains("registry CSS", cssText, "::view-transition-new(registry-header)");
expectContains("registry CSS", cssText, ".registry-tabs[data-indicator-ready");
expectContains("registry source", registryBrowseSourceText, '"no-results"');
expectContains("registry source", registryBrowseSourceText, '"mirror-empty"');
expectNotContains("registry", registryHtml, "Live production index");

expectContains("site header", siteHeaderSourceText, "@phosphor-icons/core/regular");
expectContains("site header", siteHeaderSourceText, "data-menu-toggle");
expectContains("site header", siteHeaderSourceText, "data-nav-drawer");
expectContains("site header", siteHeaderSourceText, 'role="dialog"');
expectContains("site header", siteHeaderSourceText, "closeDrawer({ restoreFocus: true })");
expectContains("site header", siteHeaderSourceText, "event.key === \"Escape\"");
expectContains("site header", siteHeaderSourceText, "data-theme-current");
expectContains("site header", siteHeaderSourceText, 'class="nav-tooltip"');
expectContains("site header", siteHeaderSourceText, 'class="language-short"');
expectContains("site header styles", cssText, ".nav-source:hover .nav-tooltip");
expectContains("site header styles", cssText, ".nav-source:focus-visible .nav-tooltip");
expectAnyContains("site header styles", cssText, [
  "@media(min-width:841px)and (max-width:960px)",
  "@media (width>=841px) and (width<=960px)",
]);
expectNotContains("site header", siteHeaderSourceText, "theme-toggle-track");

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
expectContains("registry wallet bundle", jsText, "errorExternalSignature");
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
  const id = icon.replace(".svg", "");
  expectAnyContains("registry wallet bundle", jsText, [`\"${id}\"`, `'${id}'`, `\`${id}\``]);
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
expectContains("playground bundle", jsText, 'cellscript_version = "0.26.0"');
expectNotContains("playground bundle", jsText, 'cellscript_version = "0.20.0-rc.1"');
expectContains("playground worker", playgroundWorker, `const COMPILER_ASSET_VERSION = "${expectedCompilerAssetVersion}"`);
expectContains("playground", playgroundHtml, "data-pg-studio");
expectContains("playground", playgroundHtml, "data-focus-toggle");
expectContains("playground", playgroundHtml, "cellscript-playground-focus-mode");
expectContains("playground focus bundle", jsText, "cellscript-playground-focus-mode");
expectContains("playground", playgroundHtml, 'data-output-panel="flow"');
expectContains("playground", playgroundHtml, "data-inspector");
expectContains("playground", playgroundHtml, "data-output-stale");
expectContains("playground", playgroundHtml, "data-guide");
expectContains("playground session bundle", jsText, "cellscript-playground-session-v1");
expectContains("playground guide bundle", jsText, "cellscript-playground-guide-v1");
expectContains("playground worker recovery bundle", jsText, "retryCompiler");
expectContains("playground worker", playgroundWorker, "COMPILER_LOAD_TIMEOUT_MS = 12_000");
expectContains("playground worker", playgroundWorker, 'type: "compiler-error"');
expectContains("playground worker", playgroundWorker, 'cache: "force-cache"');
expectContains("playground worker recovery bundle", jsText, "compiler_load_timeout");
expectNotContains("playground", playgroundHtml.toLowerCase(), "command palette");

const playgroundI18nAssignments = countContains(playgroundHtml, "window.__CELLSCRIPT_I18N__ =");
if (playgroundI18nAssignments !== 1) {
  fail(`playground: expected one i18n payload, found ${playgroundI18nAssignments}`);
}
const playgroundHtmlGzipBytes = gzipSync(playgroundHtml).byteLength;
if (playgroundHtmlGzipBytes > 70_000) {
  fail(`playground: compressed HTML ${playgroundHtmlGzipBytes} bytes exceeds the 70000-byte startup budget`);
}

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
  "@media (width<=840px)",
  ".nav-drawer-backdrop",
  ".nav-menu-toggle",
  ".registry-skeleton-row",
  ".registry-wallet-dialog-head:has(.registry-wallet-back[hidden])",
  ".registry-shell-bar",
  ".registry-hero",
  ".registry-network-card",
  ".registry-tool-route",
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
