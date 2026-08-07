import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/lib/registry-url.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, strict: true },
  fileName: sourceUrl.pathname,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const { registryHttpsUrl } = await import(moduleUrl);

assert.equal(registryHttpsUrl("https://github.com/cellscript/demo"), "https://github.com/cellscript/demo");
for (const unsafe of [
  "javascript:alert(document.domain)",
  " https://example.com/leading-space",
  "data:text/html,<script>alert(1)</script>",
  "http://example.com/demo",
  "https://user:secret@example.com/demo",
  "//example.com/demo",
  "",
]) {
  assert.equal(registryHttpsUrl(unsafe), undefined, `expected rejection for ${unsafe}`);
}

console.log("registry URL policy: safe HTTPS-only links passed");
