export type RegistryEnvironment = "production" | "testnet-sandbox";

const environmentValue = import.meta.env.PUBLIC_REGISTRY_ENVIRONMENT || "production";

if (environmentValue !== "production" && environmentValue !== "testnet-sandbox") {
  throw new Error("PUBLIC_REGISTRY_ENVIRONMENT must be production or testnet-sandbox");
}

export const registryRuntime = environmentValue === "testnet-sandbox"
  ? {
      environment: "testnet-sandbox" as const,
      network: "testnet" as const,
      addressPrefix: "ckt",
      apiOrigin: (import.meta.env.PUBLIC_REGISTRY_API_ORIGIN || "https://api.testnet.registry.cellscript.dev").replace(/\/$/, ""),
      staticOrigin: (import.meta.env.PUBLIC_STATIC_REGISTRY_ORIGIN || "https://objects.testnet.registry.cellscript.dev").replace(/\/$/, ""),
      siteOrigin: (import.meta.env.PUBLIC_REGISTRY_SITE_ORIGIN || "https://testnet.registry.cellscript.dev").replace(/\/$/, ""),
      alternateOrigin: "https://cellscript.dev/registry",
    }
  : {
      environment: "production" as const,
      network: "mainnet" as const,
      addressPrefix: "ckb",
      apiOrigin: (import.meta.env.PUBLIC_REGISTRY_API_ORIGIN || "https://api.registry.cellscript.dev").replace(/\/$/, ""),
      staticOrigin: (import.meta.env.PUBLIC_STATIC_REGISTRY_ORIGIN || "https://registry.cellscript.dev").replace(/\/$/, ""),
      siteOrigin: (import.meta.env.PUBLIC_REGISTRY_SITE_ORIGIN || "https://cellscript.dev").replace(/\/$/, ""),
      alternateOrigin: "https://testnet.registry.cellscript.dev/registry",
    };

export const isTestnetSandbox = registryRuntime.environment === "testnet-sandbox";
