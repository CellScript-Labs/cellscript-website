#!/usr/bin/env node
/** Generate website registry data from real CellScript package metadata. */

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse as parseToml } from "smol-toml";
import { jsonWithAsciiEscapes } from "./ascii-json.mjs";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(WEBSITE_ROOT, "src/data/registry-packages.json");
const SKIP_DIRS = new Set([".git", ".astro", ".cell", "dist", "node_modules", "target"]);
const REGISTRY_SCHEMA_VERSION = 1;
const CELLSCRIPT_EDITION = "2026";
const REGISTRY_STATUSES = new Set([
  "source_published",
  "indexed_pending",
  "verified_build",
  "deployed",
  "on_chain_committed",
  "deprecated",
  "yanked",
  "quarantined",
]);

function registryRoot() {
  const configured = process.env.CELLSCRIPT_REGISTRY_ROOT;
  if (configured) {
    const expanded = configured === "~" || configured.startsWith(`~${sep}`)
      ? resolve(homedir(), configured.slice(2))
      : configured;
    return realpathSync(resolve(expanded));
  }
  const parent = resolve(WEBSITE_ROOT, "..");
  if (existsSync(resolve(parent, ".gitmodules")) && existsSync(resolve(parent, "Cargo.toml"))) {
    return parent;
  }
  return WEBSITE_ROOT;
}

const REPO_ROOT = registryRoot();

function posixRelative(from, to) {
  return relative(from, to).split(sep).join("/");
}

function isSkipped(candidate) {
  return posixRelative(REPO_ROOT, candidate).split("/").some((part) => SKIP_DIRS.has(part));
}

function readJson(candidate) {
  return JSON.parse(readFileSync(candidate, "utf8"));
}

function readToml(candidate) {
  return existsSync(candidate) ? parseToml(readFileSync(candidate, "utf8")) : {};
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return result.status === 0
    ? { ok: true, output: result.stdout.trim() }
    : { ok: false, output: "", error: result.stderr.trim() || `git exited with status ${result.status ?? "unknown"}` };
}

function gitSource(candidate) {
  const rootResult = git(["-C", dirname(candidate), "rev-parse", "--show-toplevel"], REPO_ROOT);
  if (!rootResult.ok || !rootResult.output) {
    throw new Error(`cannot resolve the git repository for ${posixRelative(REPO_ROOT, candidate)}: ${rootResult.error || "empty git output"}`);
  }
  const root = rootResult.output;
  const revisionResult = git(["rev-parse", "HEAD"], root);
  if (!revisionResult.ok || !revisionResult.output) {
    throw new Error(
      `cannot record a source revision for ${posixRelative(REPO_ROOT, candidate)}: ${revisionResult.error || "git returned no revision"}`,
    );
  }
  const remoteResult = git(["remote", "get-url", "origin"], root);
  if (!remoteResult.ok || !remoteResult.output) {
    throw new Error(`cannot record the source repository for ${posixRelative(REPO_ROOT, candidate)}: ${remoteResult.error || "origin is missing"}`);
  }
  const remote = remoteResult.output
    .replace(/^git@github[.]com:/, "https://github.com/")
    .replace(/^ssh:\/\/git@github[.]com\//, "https://github.com/")
    .replace(/[.]git$/, "");
  let remoteUrl;
  try {
    remoteUrl = new URL(remote);
  } catch {
    throw new Error(`source repository for ${posixRelative(REPO_ROOT, candidate)} must have an HTTPS browser URL`);
  }
  if (remoteUrl.protocol !== "https:" || remoteUrl.username || remoteUrl.password || remoteUrl.search || remoteUrl.hash) {
    throw new Error(`source repository for ${posixRelative(REPO_ROOT, candidate)} must use a credential-free HTTPS browser URL`);
  }
  const resolvedRoot = realpathSync(root);
  return {
    revision: revisionResult.output,
    repository: `${remoteUrl.origin}${remoteUrl.pathname.replace(/\/$/, "")}`,
    package_path: posixRelative(resolvedRoot, realpathSync(dirname(candidate))),
    registry_path: posixRelative(resolvedRoot, realpathSync(candidate)),
  };
}

function latestVersion(versions) {
  const active = versions.filter((version) => !version.yanked);
  const candidates = active.length ? active : versions;
  return candidates.length
    ? [...candidates].sort((left, right) => String(left.released_at || left.version || "").localeCompare(String(right.released_at || right.version || ""))).at(-1)
    : null;
}

function deploymentSummary(deployed) {
  const deployments = Array.isArray(deployed.deployments) ? deployed.deployments : [];
  const active = deployments.filter((item) => item.status === "active");
  const networks = [...new Set(deployments.map((item) => item.network).filter(Boolean).map(String))].sort();
  return { count: deployments.length, active_count: active.length, networks, active };
}

function requiredText(record, key, location) {
  const value = record?.[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${location} must record ${key}`);
  }
  return value.trim();
}

function requiredRecord(record, key, location) {
  const value = record?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${location} must record ${key} as an object`);
  }
  return value;
}

function packageRecord(registryPath) {
  const registry = readJson(registryPath);
  const registryLocation = posixRelative(REPO_ROOT, registryPath);
  if (registry.schema_version !== REGISTRY_SCHEMA_VERSION) {
    throw new Error(`${registryLocation} must use registry schema ${REGISTRY_SCHEMA_VERSION}`);
  }
  const namespace = requiredText(registry, "namespace", registryLocation);
  const name = requiredText(registry, "name", registryLocation);
  if (!Array.isArray(registry.versions) || registry.versions.length === 0) {
    throw new Error(`${registryLocation} must contain a non-empty versions array`);
  }
  for (const version of registry.versions) {
    if (!version || typeof version !== "object" || Array.isArray(version)) {
      throw new Error(`${registryLocation} versions must be objects`);
    }
    const versionNumber = requiredText(version, "version", registryLocation);
    if (requiredText(version, "tag", registryLocation) !== `v${versionNumber}`) {
      throw new Error(`${registryLocation} version ${versionNumber} must use tag v${versionNumber}`);
    }
    const sourceHash = requiredText(version, "source_hash", registryLocation);
    if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(sourceHash)) {
      throw new Error(`${registryLocation} version ${versionNumber} must record a 32-byte source_hash`);
    }
    requiredText(version, "cellscript_version", registryLocation);
    if (version.edition !== CELLSCRIPT_EDITION) {
      throw new Error(`${registryLocation} version ${versionNumber} must use Edition ${CELLSCRIPT_EDITION}`);
    }
    if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(String(version.compatibility_profile_hash || ""))) {
      throw new Error(`${registryLocation} version ${versionNumber} must record compatibility_profile_hash`);
    }
    requiredRecord(version, "dependencies", registryLocation);
    if (!REGISTRY_STATUSES.has(version.status)) {
      throw new Error(`${registryLocation} version ${versionNumber} must record a valid status`);
    }
    if (typeof version.yanked !== "boolean") {
      throw new Error(`${registryLocation} version ${versionNumber} must record yanked as a boolean`);
    }
  }
  const packageDir = dirname(registryPath);
  const manifest = readToml(resolve(packageDir, "Cell.toml"));
  const deployed = readToml(resolve(packageDir, "Deployed.toml"));
  const packageManifest = manifest.package && typeof manifest.package === "object" && !Array.isArray(manifest.package) ? manifest.package : {};
  if (packageManifest.namespace !== namespace || packageManifest.name !== name) {
    throw new Error(`${registryLocation} package identity must match Cell.toml`);
  }
  if (packageManifest.edition !== CELLSCRIPT_EDITION) {
    throw new Error(`${registryLocation} Cell.toml must use Edition ${CELLSCRIPT_EDITION}`);
  }
  const policy = manifest.policy && typeof manifest.policy === "object" && !Array.isArray(manifest.policy) ? manifest.policy : {};
  const metadata = manifest.metadata && typeof manifest.metadata === "object" && !Array.isArray(manifest.metadata) ? manifest.metadata : {};
  const latest = latestVersion(registry.versions);
  const deployment = deploymentSummary(deployed);
  const latestValue = String(latest?.version || packageManifest.version || "");
  const status = deployment.active_count ? "deployed" : String(latest?.status || "source_published");
  const packagePath = posixRelative(REPO_ROOT, packageDir);
  const source = gitSource(registryPath);
  const artifact = {
    kind: typeof metadata.profile === "string" && metadata.profile.trim() ? "profile_library" : "source_library",
    profile: "cellscript_source",
    consumption_mode: "dependency",
    language: "cellscript",
  };
  return {
    coordinate: `${namespace}/${name}`,
    namespace,
    name,
    path: packagePath,
    registry_path: posixRelative(REPO_ROOT, registryPath),
    source_revision: source.revision,
    source_repository: source.repository,
    source_package_path: source.package_path,
    source_registry_path: source.registry_path,
    description: packageManifest.description || "",
    license: latest?.license || packageManifest.license || "",
    repository: packageManifest.repository || "",
    homepage: packageManifest.homepage || "",
    documentation: packageManifest.documentation || "",
    keywords: packageManifest.keywords || [],
    categories: packageManifest.categories || [],
    production: Boolean(policy.production || false),
    artifact,
    policy,
    metadata,
    latest_version: latestValue,
    latest,
    versions: registry.versions,
    deployment,
    status,
    install_command: latestValue ? `cellc install ${namespace}/${name}@${latestValue}` : `cellc install ${namespace}/${name}`,
    package_command_prefix: `cd ${packagePath}`,
    verify_command: `cd ${packagePath} && cellc registry verify --live --json`,
    publish_command: `cd ${packagePath} && cellc publish`,
    publish_dry_run_command: `cd ${packagePath} && cellc publish --dry-run`,
    edit_command: `cd ${packagePath} && cellc registry edit`,
  };
}

async function findRegistryFiles(start) {
  const found = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const candidate = resolve(directory, entry.name);
      if (isSkipped(candidate)) continue;
      if (entry.isDirectory()) await visit(candidate);
      else if (entry.isFile() && entry.name === "registry.json") found.push(candidate);
    }
  }
  await visit(start);
  return found.sort();
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}

const registryPaths = await findRegistryFiles(REPO_ROOT);
if (!registryPaths.length) {
  throw new Error(
    `no registry.json sources found under ${REPO_ROOT}; refusing to publish or retain a potentially stale ${posixRelative(WEBSITE_ROOT, OUT)}`,
  );
}
const records = registryPaths.map(packageRecord).filter(Boolean).sort((left, right) => left.coordinate.localeCompare(right.coordinate));
const payload = {
  schema_version: REGISTRY_SCHEMA_VERSION,
  source: "registry.json + Cell.toml + Deployed.toml scan",
  packages: records,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${jsonWithAsciiEscapes(sortJson(payload))}\n`, "utf8");
console.log(`generated ${posixRelative(REPO_ROOT, OUT)} with ${records.length} package(s)`);
