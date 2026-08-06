import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const globalCss = readFileSync(resolve(root, "src/styles/global.css"), "utf8");
const registryCss = readFileSync(resolve(root, "src/styles/registry.css"), "utf8");
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
if (!globalCss.includes("padding-inline: max(var(--page-pad-inline), calc((100% - var(--max)) / 2));")) {
  throw new Error("Playground toolbar controls must align with the global frame");
}

console.log("visual token and readability contract ok");
