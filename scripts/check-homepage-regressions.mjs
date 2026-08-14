import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const failures = [];

const fail = (message) => {
  failures.push(message);
};

const requireMatch = (name, text, pattern) => {
  if (!pattern.test(text)) fail(`missing homepage contract: ${name}`);
};

const indexPath = resolve("dist", "index.html");
const cssPath = resolve("src", "styles", "global.css");
const activityPath = resolve("src", "data", "github-activity.json");

if (!existsSync(indexPath)) fail("dist/index.html is missing; run astro build before homepage regression checks");
if (!existsSync(cssPath)) fail("src/styles/global.css is missing");
if (!existsSync(activityPath)) fail("src/data/github-activity.json is missing");

const indexHtml = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : "";
const css = existsSync(cssPath) ? readFileSync(cssPath, "utf-8") : "";
const activity = existsSync(activityPath)
  ? JSON.parse(readFileSync(activityPath, "utf-8"))
  : { releases: [] };
const release = activity.releases?.[0];

if (!release?.url) {
  fail("latest GitHub release URL is missing from src/data/github-activity.json");
} else {
  const releaseTags = [...indexHtml.matchAll(/<a\b[^>]*class="hero-release-tag"[^>]*>/g)].map((match) => match[0]);
  const releaseTag = releaseTags.find((tag) => tag.includes(`href="${release.url}"`));
  if (!releaseTag) {
    fail(`release badge must link to ${release.url}`);
  } else {
    if (!releaseTag.includes('target="_blank"')) fail("release badge link must open in a new tab");
    if (!releaseTag.includes('rel="noopener noreferrer"')) fail("release badge link must use noopener noreferrer");
  }
}

requireMatch(
  "value-card caption container stays in foreground",
  css,
  /\.value-card-copy\s*\{[^}]*z-index:\s*var\(--z-elevated\)/s,
);
requireMatch(
  "value-card captions stay in foreground",
  css,
  /\.value-card h3,\s*\.value-card p\s*\{[^}]*z-index:\s*var\(--z-elevated\)/s,
);
requireMatch(
  "value-card index stays in foreground",
  css,
  /\.value-index\s*\{[^}]*z-index:\s*var\(--z-elevated\)/s,
);
requireMatch(
  "playground example caption container stays in foreground",
  css,
  /\.landing-example-copy\s*\{[^}]*z-index:\s*var\(--z-elevated\)/s,
);
requireMatch(
  "playground example captions stay in foreground",
  css,
  /\.landing-example-card h3,\s*\.landing-example-card p\s*\{[^}]*z-index:\s*var\(--z-elevated\)/s,
);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("homepage regression checks ok");
