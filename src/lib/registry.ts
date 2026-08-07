import registryDataJson from "../data/registry-packages.json";
import {
  deriveArtifactGuidance,
  type RegistryArtifactGuidance,
} from "./registry-guidance";
import { registryHttpsUrl } from "./registry-url";

export {
  deriveArtifactGuidance,
  type RegistryArtifactGuidance,
  type RegistryConsumerAction,
  type RegistryMaintainerAction,
  type RegistryUsageState,
} from "./registry-guidance";

export const registryEntryStatuses = [
  "source_published",
  "indexed_pending",
  "verified_build",
  "deployed",
  "on_chain_committed",
  "deprecated",
  "yanked",
  "quarantined",
] as const;

export type RegistryEntryStatus = (typeof registryEntryStatuses)[number];
export type RegistryPackageStatus = RegistryEntryStatus;

export interface RegistryVersion {
  version: string;
  tag: string;
  source_hash: string;
  cellscript_version?: string;
  /** Long-lived source-semantics epoch. */
  edition?: "2026";
  /** Resolved target/assurance/ABI/schema profile identity. */
  compatibility_profile_hash?: string;
  dependencies?: Record<string, { namespace: string; version: string }>;
  status: RegistryEntryStatus;
  yanked: boolean;
  license?: string;
  released_at?: string;
  yanked_at?: string;
  yanked_reason?: string;
  replaced_by?: string;
  abi_index?: string;
  schema_hash?: string;
}

export type RegistryArtifactKind =
  | "source_library"
  | "profile_library"
  | "runtime_verifier"
  | "deployable_contract"
  | "reproducible_binary"
  | "template";

export interface RegistryArtifactDescriptor {
  kind: RegistryArtifactKind;
  profile: "cellscript_source" | "ckb_executable" | "reproducible_build" | "copy_material";
  consumption_mode: "dependency" | "tcb" | "deployment" | "copy";
  language: "cellscript" | "rust" | "c" | "javascript" | "other" | "unspecified";
}

export interface RegistryRelease {
  release: string;
  source_hash: string;
  manifest_hash?: string;
  artifact_hash?: string;
  abi_hash?: string;
  build_recipe_hash?: string;
  profile_contract?: Record<string, any>;
  verification_status: "pending" | "hash_bound" | "verified" | "evidence_required" | "rejected";
  deployment_status: "not_applicable" | "undeployed" | "deployed" | "chain_verified";
  availability_status: "active" | "deprecated" | "yanked" | "quarantined";
  immutable_bundle?: { url?: string; content_type?: string; size_bytes?: number };
  direct_url?: string;
  created_at?: string;
  registry_environment?: "production" | "testnet-sandbox";
  network?: "mainnet" | "testnet";
  expires_at?: string;
  purge_after?: string;
  evidence?: RegistryEvidence[];
}

export interface RegistryDeployment {
  name?: string;
  status?: string;
  network?: string;
  chain_id?: string;
  out_point?: string | { tx_hash: string; index: number };
  output_index?: number;
  code_hash?: string;
  data_hash?: string;
  tx_hash?: string;
  hash_type?: string;
  dep_type?: string;
  compiler_version?: string;
  artifact_hash?: string;
  metadata_hash?: string;
  schema_hash?: string;
  abi_hash?: string;
  constraints_hash?: string;
  audit_report_hash?: string;
  cell_data_codec_manifest_hash?: string;
}

export interface RegistryEvidence {
  version?: string;
  kind: "verified_build" | "reproduced_build" | "deployed" | "on_chain_committed";
  evidence_hash?: string;
  producer?: string;
  generated_at?: string;
  network?: string;
  code_hash?: string;
  data_hash?: string;
  hash_type?: string;
  dep_type?: string;
  out_point?: string | { tx_hash: string; index: number };
  chain_verification?: string;
  evidence?: Record<string, unknown>;
}

export interface RegistryEvidenceView extends RegistryEvidence {
  producer?: string;
}

export interface RegistryReleaseView extends Omit<RegistryRelease, "evidence"> {
  evidence: RegistryEvidenceView[];
}

export interface RegistryPackageDetailView {
  pkg: RegistryPackageView;
  firstRelease?: RegistryReleaseView;
  releases: RegistryReleaseView[];
  evidence: RegistryEvidenceView[];
  deployments: RegistryEvidenceView[];
  profileContract?: Record<string, any>;
  installCommand: string;
  consumerCommand: string;
  recordUrl: string;
  evidenceUrl: string;
  maintainUrl: string;
  guidance: RegistryArtifactGuidance;
}

export interface RegistryPackageView {
  coordinate: string;
  namespace: string;
  name: string;
  description?: string;
  repository?: string;
  homepage?: string;
  documentation?: string;
  package_path?: string;
  package_dir_url?: string;
  registry_json_url?: string;
  source_snapshot_url?: string;
  license?: string;
  production: boolean;
  latest_release?: string;
  artifact: RegistryArtifactDescriptor;
  verification_status: RegistryRelease["verification_status"];
  deployment_status: RegistryRelease["deployment_status"];
  availability_status: RegistryRelease["availability_status"];
  releases: RegistryRelease[];
  deployments: RegistryDeployment[];
  evidence: RegistryEvidence[];
  install_command: string;
  verify_command: string;
}

export interface RegistryPackage {
  coordinate: string;
  namespace: string;
  name: string;
  path: string;
  registry_path: string;
  source_revision: string;
  source_repository: string;
  source_package_path: string;
  source_registry_path: string;
  description?: string;
  license?: string;
  repository?: string;
  homepage?: string;
  documentation?: string;
  keywords?: string[];
  categories?: string[];
  production?: boolean;
  artifact: RegistryArtifactDescriptor;
  policy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  latest_version?: string;
  latest?: RegistryVersion | null;
  versions: RegistryVersion[];
  deployment: {
    count: number;
    active_count: number;
    networks: string[];
    active: RegistryDeployment[];
  };
  status: RegistryPackageStatus;
  install_command: string;
  package_command_prefix: string;
  verify_command: string;
  publish_command: string;
  publish_dry_run_command: string;
  edit_command: string;
}

export interface RegistryData {
  schema_version: 1;
  source: string;
  packages: RegistryPackage[];
}

export const registryData = validateRegistryData(registryDataJson);
export const registryPackages = registryData.packages;

export interface RegistrySection {
  href: string;
  label: string;
  i18nKey: string;
}

export const registrySections: RegistrySection[] = [
  { href: "/registry", label: "Registry", i18nKey: "registry.nav.browse" },
  { href: "/registry/submit", label: "Submit", i18nKey: "registry.nav.submit" },
  { href: "/registry/api", label: "API", i18nKey: "registry.nav.api" },
];

export function packageHref(pkg: RegistryPackage): string {
  return `/registry/package/${encodeURIComponent(pkg.namespace)}/${encodeURIComponent(pkg.name)}`;
}

export function shortHash(value?: string, visible = 12, missingLabel = "—"): string {
  if (!value) return missingLabel;
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  if (clean.length <= visible * 2) return value;
  return `${value.startsWith("0x") ? "0x" : ""}${clean.slice(0, visible)}…${clean.slice(-visible)}`;
}

export type RegistryStatusTone = "active" | "info" | "warning" | "danger" | "source";

export const registryStatusTones: Readonly<Record<string, RegistryStatusTone>> = {
  active: "active",
  deployed: "active",
  on_chain_committed: "active",
  chain_verified: "active",
  verified: "active",
  hash_bound: "info",
  verified_build: "info",
  evidence_required: "info",
  indexed_pending: "warning",
  pending: "warning",
  undeployed: "warning",
  deprecated: "warning",
  yanked: "danger",
  quarantined: "danger",
  rejected: "danger",
};

export function registryStatusTone(status?: string): RegistryStatusTone {
  return status ? registryStatusTones[status] ?? "source" : "source";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const registryEvidenceKinds = new Set<RegistryEvidence["kind"]>([
  "verified_build",
  "reproduced_build",
  "deployed",
  "on_chain_committed",
]);

function isRegistryOutPoint(value: unknown): value is string | { tx_hash: string; index: number } {
  return typeof value === "string"
    || (isRecord(value) && typeof value.tx_hash === "string" && Number.isInteger(value.index) && Number(value.index) >= 0);
}

function isRegistryDeployment(value: unknown): value is RegistryDeployment {
  if (!isRecord(value)) return false;
  return (value.out_point === undefined || isRegistryOutPoint(value.out_point))
    && (value.output_index === undefined || (Number.isInteger(value.output_index) && Number(value.output_index) >= 0));
}

function isRegistryArtifactDescriptor(value: unknown): value is RegistryArtifactDescriptor {
  if (!isRecord(value)) return false;
  return ["source_library", "profile_library", "runtime_verifier", "deployable_contract", "reproducible_binary", "template"].includes(String(value.kind))
    && ["cellscript_source", "ckb_executable", "reproducible_build", "copy_material"].includes(String(value.profile))
    && ["dependency", "tcb", "deployment", "copy"].includes(String(value.consumption_mode))
    && ["cellscript", "rust", "c", "javascript", "other", "unspecified"].includes(String(value.language));
}

function registryDeploymentList(value: unknown): RegistryDeployment[] | undefined {
  if (value === undefined) return [];
  return Array.isArray(value) && value.every(isRegistryDeployment)
    ? value
    : undefined;
}

function registryEvidenceList(value: unknown): RegistryEvidence[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return undefined;
  const result: RegistryEvidence[] = [];
  for (const item of value) {
    if (!isRecord(item)
      || !registryEvidenceKinds.has(item.kind as RegistryEvidence["kind"])
      || (item.out_point !== undefined && !isRegistryOutPoint(item.out_point))
      || (item.evidence !== undefined && !isRecord(item.evidence))
      || (item.chain_verification !== undefined && typeof item.chain_verification !== "string")) {
      return undefined;
    }
    result.push(item as unknown as RegistryEvidence);
  }
  return result;
}

function validateRegistryData(value: unknown): RegistryData {
  if (!isRecord(value) || value.schema_version !== 1 || typeof value.source !== "string" || !Array.isArray(value.packages)) {
    throw new Error("website registry data does not match schema version 1");
  }
  const statuses = new Set<string>(registryEntryStatuses);
  for (const [packageIndex, candidate] of value.packages.entries()) {
    const location = `registry package ${packageIndex}`;
    if (!isRecord(candidate)) throw new Error(`${location} must be an object`);
    const namespace = optionalString(candidate.namespace);
    const name = optionalString(candidate.name);
    if (!namespace || !name || candidate.coordinate !== `${namespace}/${name}`) {
      throw new Error(`${location} has an invalid coordinate`);
    }
    for (const key of [
      "path",
      "registry_path",
      "source_repository",
      "source_registry_path",
      "install_command",
      "package_command_prefix",
      "verify_command",
      "publish_command",
      "publish_dry_run_command",
      "edit_command",
    ]) {
      if (!optionalString(candidate[key])) throw new Error(`${location} must record ${key}`);
    }
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(String(candidate.source_revision ?? ""))) {
      throw new Error(`${location} must record a canonical git source_revision`);
    }
    if (typeof candidate.source_package_path !== "string") {
      throw new Error(`${location} must record source_package_path`);
    }
    if (!statuses.has(String(candidate.status))) {
      throw new Error(`${location} has an unknown status`);
    }
    if (!isRegistryArtifactDescriptor(candidate.artifact)) {
      throw new Error(`${location} has an invalid artifact descriptor`);
    }
    if (!Array.isArray(candidate.versions) || candidate.versions.length === 0) {
      throw new Error(`${location} must contain at least one version`);
    }
    for (const [versionIndex, version] of candidate.versions.entries()) {
      if (!isRecord(version)) throw new Error(`${location} version ${versionIndex} must be an object`);
      const number = optionalString(version.version);
      if (
        !number
        || version.tag !== `v${number}`
        || !/^(?:0x)?[0-9a-f]{64}$/i.test(String(version.source_hash ?? ""))
        || !statuses.has(String(version.status))
        || typeof version.yanked !== "boolean"
      ) {
        throw new Error(`${location} version ${versionIndex} violates the registry version contract`);
      }
    }
    if (!isRecord(candidate.deployment)
      || !Number.isInteger(candidate.deployment.count)
      || !Number.isInteger(candidate.deployment.active_count)
      || !Array.isArray(candidate.deployment.networks)
      || !candidate.deployment.networks.every((network) => typeof network === "string")
      || !Array.isArray(candidate.deployment.active)
      || !candidate.deployment.active.every(isRegistryDeployment)) {
      throw new Error(`${location} has an invalid deployment summary`);
    }
  }
  return value as unknown as RegistryData;
}

function evidenceView(item: RegistryEvidence): RegistryEvidenceView {
  const nested = isRecord(item.evidence) ? item.evidence : {};
  return {
    ...nested,
    ...item,
    producer: item.producer ?? optionalString(nested.producer),
  } as RegistryEvidenceView;
}

export function registryOutPointLabel(value?: string | { tx_hash: string; index: number }): string | undefined {
  if (typeof value === "string") return value;
  return value ? `${value.tx_hash}:${value.index}` : undefined;
}

export function registryDateLabel(value?: string, missingLabel = "not recorded", locale: "en" | "zh" = "en"): string {
  if (!value) return missingLabel;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return missingLabel;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function registryPackageDetailView(pkg: RegistryPackageView, apiOrigin: string): RegistryPackageDetailView {
  const releases: RegistryReleaseView[] = pkg.releases.map((release) => ({
    ...release,
    evidence: (release.evidence ?? []).map(evidenceView),
  }));
  const firstRelease = releases.find((release) => release.release === pkg.latest_release) ?? releases[0];
  const topLevelEvidence = pkg.evidence.map(evidenceView);
  const releaseEvidence = releases.flatMap((release) => release.evidence);
  const evidence = releaseEvidence.length > 0 ? releaseEvidence : topLevelEvidence;
  const evidenceDeployments = evidence.filter((item) => item.kind === "deployed");
  const deployments: RegistryEvidenceView[] = evidenceDeployments.length > 0
    ? evidenceDeployments
    : pkg.deployments.map((deployment) => ({ ...deployment, kind: "deployed" }));
  const profileContract = firstRelease?.profile_contract;
  const cleanApiOrigin = (registryHttpsUrl(apiOrigin) ?? "https://api.registry.cellscript.dev/").replace(/\/$/, "");
  const apiArg = ` --api-url ${cleanApiOrigin}`;
  const release = firstRelease?.release ?? pkg.latest_release ?? "<release>";
  const coordinate = `${pkg.coordinate}@${release}`;
  const consumerCommand = pkg.artifact.consumption_mode === "dependency"
    ? ""
    : pkg.artifact.consumption_mode === "copy"
      ? `cellc artifact copy ${coordinate} --destination . --accept-hash-bound${apiArg}`
      : pkg.artifact.consumption_mode === "deployment" && firstRelease?.deployment_status === "chain_verified"
        ? `cellc artifact cell-dep ${coordinate} --output CellDep.json --accept-hash-bound${apiArg}`
        : pkg.artifact.consumption_mode === "deployment"
          ? `cellc artifact pin ${coordinate} --output Artifacts.lock --accept-hash-bound${apiArg}`
          : `cellc artifact pin ${coordinate} --output Artifacts.lock --accept-hash-bound${apiArg}`;
  const recordUrl = registryHttpsUrl(firstRelease?.direct_url)
    ?? registryHttpsUrl(firstRelease?.immutable_bundle?.url)
    ?? registryHttpsUrl(pkg.registry_json_url)
    ?? "#";
  const maintainUrl = `/registry/manage?package=${encodeURIComponent(pkg.coordinate)}`;
  const installCommand = pkg.install_command || `cellc install ${coordinate}`;
  const evidenceUrl = `${cleanApiOrigin}/v1/artifacts/${encodeURIComponent(pkg.namespace)}/${encodeURIComponent(pkg.name)}/releases/${encodeURIComponent(release)}/evidence`;
  const guidance = deriveArtifactGuidance({
    availabilityStatus: pkg.availability_status,
    verificationStatus: pkg.verification_status,
    deploymentStatus: pkg.deployment_status,
    consumptionMode: pkg.artifact.consumption_mode,
    installCommand,
    consumerCommand,
    recordUrl,
    maintainUrl,
  });

  return {
    pkg,
    firstRelease,
    releases,
    evidence,
    deployments,
    profileContract,
    installCommand,
    consumerCommand,
    recordUrl,
    evidenceUrl,
    maintainUrl,
    guidance,
  };
}

const artifactKinds = new Set<RegistryArtifactKind>([
  "source_library",
  "profile_library",
  "runtime_verifier",
  "deployable_contract",
  "reproducible_binary",
  "template",
]);
const artifactProfiles = new Set<RegistryArtifactDescriptor["profile"]>([
  "cellscript_source",
  "ckb_executable",
  "reproducible_build",
  "copy_material",
]);
const consumptionModes = new Set<RegistryArtifactDescriptor["consumption_mode"]>(["dependency", "tcb", "deployment", "copy"]);
const artifactLanguages = new Set<RegistryArtifactDescriptor["language"]>([
  "cellscript",
  "rust",
  "c",
  "javascript",
  "other",
  "unspecified",
]);
const verificationStatuses = new Set<RegistryRelease["verification_status"]>([
  "pending",
  "hash_bound",
  "verified",
  "evidence_required",
  "rejected",
]);
const deploymentStatuses = new Set<RegistryRelease["deployment_status"]>([
  "not_applicable",
  "undeployed",
  "deployed",
  "chain_verified",
]);
const availabilityStatuses = new Set<RegistryRelease["availability_status"]>(["active", "deprecated", "yanked", "quarantined"]);

export function registryPackageViewFromApi(value: unknown): RegistryPackageView | undefined {
  if (!isRecord(value) || value.schema !== "cellscript-registry-artifact" || !isRecord(value.artifact)) return undefined;
  const namespace = optionalString(value.namespace);
  const name = optionalString(value.name);
  const coordinate = optionalString(value.coordinate);
  const kind = optionalString(value.artifact.kind) as RegistryArtifactKind | undefined;
  const profile = optionalString(value.artifact.profile) as RegistryArtifactDescriptor["profile"] | undefined;
  const consumptionMode = optionalString(value.artifact.consumption_mode) as RegistryArtifactDescriptor["consumption_mode"] | undefined;
  const language = optionalString(value.artifact.language) as RegistryArtifactDescriptor["language"] | undefined;
  if (
    !namespace
    || !name
    || coordinate !== `${namespace}/${name}`
    || !kind
    || !artifactKinds.has(kind)
    || !profile
    || !artifactProfiles.has(profile)
    || !consumptionMode
    || !consumptionModes.has(consumptionMode)
    || !language
    || !artifactLanguages.has(language)
    || !Array.isArray(value.releases)
  ) return undefined;

  const releases: RegistryRelease[] = [];
  for (const candidate of value.releases) {
    if (!isRecord(candidate)) return undefined;
    const release = optionalString(candidate.release);
    const sourceHash = optionalString(candidate.source_hash);
    const verificationStatus = optionalString(candidate.verification_status) as RegistryRelease["verification_status"] | undefined;
    const deploymentStatus = optionalString(candidate.deployment_status) as RegistryRelease["deployment_status"] | undefined;
    const availabilityStatus = optionalString(candidate.availability_status) as RegistryRelease["availability_status"] | undefined;
    const evidence = registryEvidenceList(candidate.evidence);
    if (
      !release
      || !sourceHash
      || !verificationStatus
      || !verificationStatuses.has(verificationStatus)
      || !deploymentStatus
      || !deploymentStatuses.has(deploymentStatus)
      || !availabilityStatus
      || !availabilityStatuses.has(availabilityStatus)
      || !evidence
      || (candidate.profile_contract !== undefined && !isRecord(candidate.profile_contract))
      || (candidate.immutable_bundle !== undefined && !isRecord(candidate.immutable_bundle))
    ) return undefined;
    releases.push({ ...candidate, evidence } as unknown as RegistryRelease);
  }
  const declaredLatestRelease = optionalString(value.latest_release);
  const firstRelease = releases.find((release) => release.release === declaredLatestRelease) ?? releases[0];
  const verificationStatus = optionalString(value.verification_status) as RegistryRelease["verification_status"] | undefined;
  const deploymentStatus = optionalString(value.deployment_status) as RegistryRelease["deployment_status"] | undefined;
  const availabilityStatus = optionalString(value.availability_status) as RegistryRelease["availability_status"] | undefined;
  const deployments = registryDeploymentList(value.deployments);
  const evidence = registryEvidenceList(value.evidence);
  if (
    (verificationStatus && !verificationStatuses.has(verificationStatus))
    || (deploymentStatus && !deploymentStatuses.has(deploymentStatus))
    || (availabilityStatus && !availabilityStatuses.has(availabilityStatus))
    || !deployments
    || !evidence
  ) return undefined;

  return {
    coordinate,
    namespace,
    name,
    description: optionalString(value.description),
    repository: registryHttpsUrl(value.repository),
    homepage: registryHttpsUrl(value.homepage),
    documentation: optionalString(value.documentation),
    registry_json_url: optionalString(value.registry_json_url),
    production: value.registry_environment !== "testnet-sandbox",
    latest_release: declaredLatestRelease ?? firstRelease?.release,
    artifact: { kind, profile, consumption_mode: consumptionMode, language },
    verification_status: verificationStatus ?? firstRelease?.verification_status ?? "pending",
    deployment_status: deploymentStatus ?? firstRelease?.deployment_status ?? "not_applicable",
    availability_status: availabilityStatus ?? firstRelease?.availability_status ?? "active",
    releases,
    deployments,
    evidence,
    install_command: optionalString(value.install_command) ?? `cellc install ${coordinate}@${firstRelease?.release ?? "<release>"}`,
    verify_command: optionalString(value.verify_command) ?? "cellc registry verify --live --json",
  };
}

export function toRegistryPackageView(pkg: RegistryPackage): RegistryPackageView {
  const repositoryRoot = repositoryTreeUrl(pkg.source_repository, pkg.source_revision);
  const latestStatus = pkg.latest?.status ?? pkg.versions.find((version) => version.version === pkg.latest_version)?.status ?? "source_published";
  const verificationStatus: RegistryRelease["verification_status"] = ["verified_build", "deployed", "on_chain_committed"].includes(latestStatus)
    ? "verified"
    : "pending";
  const deploymentStatus: RegistryRelease["deployment_status"] = latestStatus === "on_chain_committed"
    ? "chain_verified"
    : pkg.deployment.active_count > 0 || latestStatus === "deployed"
      ? "deployed"
      : "not_applicable";
  const availabilityStatus: RegistryRelease["availability_status"] = ["deprecated", "yanked", "quarantined"].includes(latestStatus)
    ? latestStatus as RegistryRelease["availability_status"]
    : "active";
  return {
    coordinate: pkg.coordinate,
    namespace: pkg.namespace,
    name: pkg.name,
    description: pkg.description,
    repository: registryHttpsUrl(pkg.repository),
    homepage: registryHttpsUrl(pkg.homepage),
    documentation: pkg.documentation,
    package_path: pkg.path,
    package_dir_url: pkg.source_package_path ? `${repositoryRoot}/${encodeRepositoryPath(pkg.source_package_path)}` : repositoryRoot,
    registry_json_url: `${repositoryRoot}/${encodeRepositoryPath(pkg.source_registry_path)}`,
    license: pkg.license,
    production: Boolean(pkg.production),
    latest_release: pkg.latest_version,
    artifact: pkg.artifact,
    verification_status: verificationStatus,
    deployment_status: deploymentStatus,
    availability_status: availabilityStatus,
    releases: pkg.versions.map((version) => ({
      release: version.version,
      source_hash: version.source_hash,
      verification_status: ["verified_build", "deployed", "on_chain_committed"].includes(version.status) ? "verified" : "pending",
      deployment_status: version.status === "on_chain_committed"
        ? "chain_verified"
        : version.status === "deployed" || (version.version === pkg.latest_version && pkg.deployment.active_count > 0)
          ? "deployed"
          : "not_applicable",
      availability_status: ["deprecated", "yanked", "quarantined"].includes(version.status)
        ? version.status as RegistryRelease["availability_status"]
        : "active",
      created_at: version.released_at,
    })),
    deployments: pkg.deployment.active,
    evidence: [],
    install_command: pkg.install_command || `cellc install ${pkg.coordinate}@${pkg.latest_version ?? "<release>"}`,
    verify_command: pkg.verify_command,
  };
}

function repositoryTreeUrl(repository: string, revision: string): string {
  const safeRepository = registryHttpsUrl(repository);
  if (!safeRepository) return "#";
  const clean = safeRepository.replace(/[.]git\/?$/, "").replace(/\/$/, "");
  const treeSegment = clean.includes("gitlab.com/") ? "-/tree" : "tree";
  return `${clean}/${treeSegment}/${encodeURIComponent(revision)}`;
}

function encodeRepositoryPath(path: string): string {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}
