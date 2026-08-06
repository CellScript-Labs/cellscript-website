import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const globalCss = readFileSync(resolve(root, "src/styles/global.css"), "utf8");
const registryCss = readFileSync(resolve(root, "src/styles/registry.css"), "utf8");
const playgroundPage = readFileSync(resolve(root, "src/pages/playground.astro"), "utf8");
const visualSources = [
  "src/pages/index.astro",
  "src/pages/registry.astro",
  "src/pages/registry/submit.astro",
  "src/pages/registry/manage.astro",
  "src/components/HeroStatus.astro",
].map((path) => readFileSync(resolve(root, path), "utf8")).join("\n");
const lightMarker = ':root[data-theme="light"] {';
const lightStart = globalCss.indexOf(lightMarker);
if (lightStart < 0) throw new Error("missing light-theme token block");
const darkTokens = globalCss.slice(globalCss.indexOf(":root {"), lightStart);
const lightTokens = globalCss.slice(lightStart, globalCss.indexOf("\n}", lightStart) + 2);

const readOklch = (block, name) => {
  const match = block.match(new RegExp(`--${name}:\\s*oklch\\(\\s*([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)`));
  if (!match) throw new Error(`missing opaque OKLCH token --${name}`);
  return match.slice(1).map(Number);
};

const oklchToLinearSrgb = ([lightness, chroma, hue]) => {
  const radians = hue * Math.PI / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.max(0, Math.min(1, channel)));
};

const luminance = (color) => {
  const [red, green, blue] = oklchToLinearSrgb(color);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrast = (foreground, background) => {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
};

for (const [theme, block] of [["dark", darkTokens], ["light", lightTokens]]) {
  const background = readOklch(block, "bg");
  for (const token of ["status-warning-text", "status-danger-text", "sandbox-text", "accent"]) {
    const ratio = contrast(readOklch(block, token), background);
    if (ratio < 4.5) throw new Error(`${theme} --${token} contrast ${ratio.toFixed(2)} is below 4.5:1`);
  }
  const primaryRatio = contrast(readOklch(block, "primary-contrast"), readOklch(block, "accent"));
  if (primaryRatio < 4.5) {
    throw new Error(`${theme} primary button contrast ${primaryRatio.toFixed(2)} is below 4.5:1`);
  }
}

for (const [file, css] of [["global.css", globalCss], ["registry.css", registryCss]]) {
  for (const match of css.matchAll(/font-size:\s*([0-9.]+)rem/g)) {
    const size = Number(match[1]);
    if (size < 0.68) throw new Error(`${file}: raw font size ${size}rem is below the compact-text floor`);
  }
}

if (registryCss.includes("#d88b2d")) throw new Error("Registry sandbox color bypasses semantic tokens");
if (/\.registry-maintainer-command\[data-valid="false"\][^{]*\{[^}]*opacity:/s.test(registryCss)) {
  throw new Error("invalid Registry commands must not be dimmed with container opacity");
}
if (registryCss.includes('.registry-publish-step[data-state="locked"] .registry-step-code')) {
  throw new Error("hidden publish steps retain an unreachable low-contrast rule");
}
if (/color:\s*var\(--accent-warm\)/.test(`${globalCss}\n${registryCss}`)) {
  throw new Error("decorative --accent-warm must not carry status text meaning");
}
for (const controlToken of [
  "--control-surface:",
  "--control-primary:",
  "--control-selected-surface:",
  "--control-height-dense: 32px;",
  "--control-height: 40px;",
  "--control-height-workflow: 48px;",
]) {
  if (!darkTokens.includes(controlToken)) throw new Error(`shared control system is missing ${controlToken}`);
}
for (const geometryToken of [
  "--radius-data: 4px;",
  "--radius-control: 6px;",
  "--radius-panel: 8px;",
  "--radius-overlay: 12px;",
  "--radius-dialog: 16px;",
]) {
  if (!darkTokens.includes(geometryToken)) throw new Error(`shared geometry system is missing ${geometryToken}`);
}
if (visualSources.includes("lucide-astro")) {
  throw new Error("interactive site visuals must use the shared Phosphor icon family");
}
if (/\.textContent\s*=\s*["'][→←↗✓✕×]["']|>[→←↗✓✕×]</.test(visualSources)) {
  throw new Error("interactive controls must not use Unicode glyphs as icons");
}
if (!globalCss.includes(".hero-aurora span:nth-child(2) {\n  display: none;")) {
  throw new Error("the landing hero must keep one ambient visual layer instead of stacked auroras");
}
if (!registryCss.includes(".registry-artifact-mark i {\n  display: none;")) {
  throw new Error("artifact identity marks must not reuse the network status-dot language");
}
if (registryCss.includes("--line-strong")) {
  throw new Error("Registry controls must use defined shared border tokens");
}
const registryPrimary = registryCss.match(/\.registry-button\.primary\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body || "";
if (!registryPrimary.includes("background: var(--control-primary);")) {
  throw new Error("Registry primary actions must use the shared solid primary treatment");
}

if (!globalCss.includes("--frame-max: 1440px;\n  --max: var(--frame-max);")) {
  throw new Error("global navigation and page shells must share the 1440px alignment frame");
}
const docsShell = globalCss.match(/\.docs-shell\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body || "";
if (!docsShell.includes("width: min(var(--max), calc(100% - var(--site-gutter)));")) {
  throw new Error("Docs shell must use the same frame as the topbar");
}
if (docsShell.includes("justify-content: space-between")) {
  throw new Error("Docs rails must not absorb wide-screen space into unbounded gaps");
}
if (!docsShell.includes("minmax(0, var(--docs-reading-max))")) {
  throw new Error("Docs shell must preserve the centred reading axis");
}
if (!globalCss.includes("--workbench-max: 1920px;")) {
  throw new Error("Playground workbench must have an explicit wide-screen frame");
}
const playgroundStage = globalCss.match(/\.pg-stage\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body || "";
const playgroundStudio = globalCss.match(/\.pg-studio-frame\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body || "";
if (!playgroundStage.includes("padding: 12px var(--page-pad-inline) 14px;")) {
  throw new Error("Playground stage must preserve a deliberate inset around the workbench");
}
if (!playgroundStudio.includes("width: min(100%, var(--workbench-max));")) {
  throw new Error("Playground workbench must be centred inside its dedicated frame");
}
if (!playgroundStudio.includes("max-width: var(--workbench-max);")) {
  throw new Error("Playground workbench must not outgrow its wide-screen frame");
}
if (!playgroundStudio.includes("view-transition-name: playground-studio;")) {
  throw new Error("Playground focus changes must keep a stable transition surface");
}
if (!globalCss.includes(':root[data-playground-focus="true"] .playground-body .site-header')) {
  throw new Error("Playground focus mode must remove the site chrome on desktop");
}
for (const contract of [
  "data-pg-studio",
  "data-focus-toggle",
  "cellscript-playground-focus-mode",
  "createPlaygroundFocusController",
  "data-output-panel=\"flow\"",
  "data-inspector",
  "data-output-stale",
  "data-guide",
  "createPlaygroundSessionWriter",
  "deriveCellFlow",
  'data-state="idle" aria-busy="false"',
  'compileBtn.setAttribute("aria-busy", compiling ? "true" : "false")',
  'compileLabel.textContent = compiling ? pg("compiling") : pg("compile")',
]) {
  if (!playgroundPage.includes(contract)) throw new Error(`Playground page is missing ${contract}`);
}
if (playgroundPage.toLowerCase().includes("command palette")) {
  throw new Error("Playground must not introduce a command palette");
}
if (!globalCss.includes(".pg-cell-flow") || !globalCss.includes(".pg-inspector")) {
  throw new Error("Playground Cell Flow and Inspector must have explicit visual contracts");
}
if (/\.pg-guide-trigger span,\s*\n\s*\.pg-save-state/.test(globalCss)) {
  throw new Error("mobile Playground must not hide the guide icon and label together");
}

console.log("visual token and readability contract ok");
