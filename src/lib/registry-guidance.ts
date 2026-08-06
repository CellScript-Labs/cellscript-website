export type RegistryUsageState =
  | "ready"
  | "source_only"
  | "hash_bound"
  | "needs_evidence"
  | "unavailable"
  | "deprecated";

export type RegistryConsumerAction =
  | { kind: "install" | "fetch" | "cell_dep"; action: "copy"; value: string }
  | { kind: "review"; action: "link"; value: string }
  | { kind: "refresh"; action: "refresh" }
  | { kind: "none"; action: "none" };

export type RegistryMaintainerAction =
  | { kind: "resolve_verification"; action: "link"; value: string }
  | { kind: "add_reproducibility"; action: "link"; value: string }
  | { kind: "record_deployment"; action: "link"; value: string }
  | { kind: "verify_chain"; action: "link"; value: string };

export interface RegistryArtifactGuidance {
  usageState: RegistryUsageState;
  summaryKey:
    | "ready"
    | "sourceOnly"
    | "hashBound"
    | "verificationPending"
    | "evidenceRequired"
    | "verificationRejected"
    | "unavailable"
    | "deprecated";
  consumerAction: RegistryConsumerAction;
  maintainerAction?: RegistryMaintainerAction;
}

export interface RegistryArtifactGuidanceInput {
  availabilityStatus: "active" | "deprecated" | "yanked" | "quarantined";
  verificationStatus: "pending" | "hash_bound" | "verified" | "evidence_required" | "rejected";
  deploymentStatus: "not_applicable" | "undeployed" | "deployed" | "chain_verified";
  consumptionMode: "dependency" | "tcb" | "deployment" | "copy";
  installCommand: string;
  consumerCommand: string;
  recordUrl: string;
  maintainUrl: string;
}

const maintenanceUrl = (base: string, task: string): string => {
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}task=${encodeURIComponent(task)}`;
};

export function deriveArtifactGuidance(input: RegistryArtifactGuidanceInput): RegistryArtifactGuidance {
  const review: RegistryConsumerAction = { kind: "review", action: "link", value: input.recordUrl };

  if (input.availabilityStatus === "deprecated") {
    return { usageState: "deprecated", summaryKey: "deprecated", consumerAction: review };
  }
  if (input.availabilityStatus !== "active") {
    return { usageState: "unavailable", summaryKey: "unavailable", consumerAction: review };
  }
  if (input.verificationStatus === "rejected") {
    return {
      usageState: "unavailable",
      summaryKey: "verificationRejected",
      consumerAction: review,
      maintainerAction: {
        kind: "resolve_verification",
        action: "link",
        value: maintenanceUrl(input.maintainUrl, "publish"),
      },
    };
  }
  if (input.verificationStatus === "pending") {
    return {
      usageState: "needs_evidence",
      summaryKey: "verificationPending",
      consumerAction: { kind: "refresh", action: "refresh" },
    };
  }
  if (input.verificationStatus === "evidence_required") {
    return {
      usageState: "needs_evidence",
      summaryKey: "evidenceRequired",
      consumerAction: review,
      maintainerAction: {
        kind: "add_reproducibility",
        action: "link",
        value: maintenanceUrl(input.maintainUrl, "reproduce"),
      },
    };
  }

  const maintainerAction = input.consumptionMode === "deployment" && input.deploymentStatus === "undeployed"
    ? {
        kind: "record_deployment" as const,
        action: "link" as const,
        value: maintenanceUrl(input.maintainUrl, "deployment"),
      }
    : input.consumptionMode === "deployment" && input.deploymentStatus === "deployed"
      ? {
          kind: "verify_chain" as const,
          action: "link" as const,
          value: maintenanceUrl(input.maintainUrl, "live"),
        }
      : undefined;

  const consumerAction: RegistryConsumerAction = input.consumptionMode === "dependency"
    ? { kind: "install", action: "copy", value: input.installCommand }
    : input.consumptionMode === "deployment" && input.deploymentStatus === "chain_verified"
      ? { kind: "cell_dep", action: "copy", value: input.consumerCommand }
      : input.consumerCommand
        ? { kind: "fetch", action: "copy", value: input.consumerCommand }
        : { kind: "none", action: "none" };

  if (input.verificationStatus === "hash_bound") {
    return {
      usageState: "hash_bound",
      summaryKey: "hashBound",
      consumerAction,
      maintainerAction,
    };
  }

  if (input.consumptionMode === "deployment" && input.deploymentStatus !== "chain_verified") {
    return {
      usageState: "source_only",
      summaryKey: "sourceOnly",
      consumerAction,
      maintainerAction,
    };
  }

  return {
    usageState: "ready",
    summaryKey: "ready",
    consumerAction,
    maintainerAction,
  };
}
