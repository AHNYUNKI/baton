import path from "node:path";

export type ObsidianVaultEnvironment = {
  BATON_OBSIDIAN_VAULT?: string | undefined;
};

export type ObsidianVaultConfig = {
  obsidian?: {
    vault?: string | undefined;
  };
};

export type ResolveObsidianVaultOptions = {
  env?: ObsidianVaultEnvironment | undefined;
  config?: ObsidianVaultConfig | undefined;
};

export function resolveObsidianVault(options: ResolveObsidianVaultOptions = {}): string | undefined {
  const envVault = nonEmptyString(options.env?.BATON_OBSIDIAN_VAULT);
  if (envVault !== undefined) {
    return path.resolve(envVault);
  }

  const configVault = nonEmptyString(options.config?.obsidian?.vault);
  return configVault === undefined ? undefined : path.resolve(configVault);
}

function nonEmptyString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
