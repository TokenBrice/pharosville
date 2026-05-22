export const DEFAULT_PHAROS_API_BASE: string;
export const PHAROS_SHARED_ENV_FILE: string;

export interface PharosApiConfig {
  apiBase: string;
  apiKey: string | null;
  source: string | null;
  sourcePath: string | null;
  sharedEnvPath: string | null;
  checkedPaths: string[];
}

export interface PharosApiEnvPaths {
  mainEnvPath: string | null;
  sharedEnvPath: string | null;
  worktreeEnvPath: string;
}

export interface LocalPharosApiKeyStatus {
  keyFound: boolean;
  source: string | null;
  hints?: string[];
}

export function parseLoosePharosEnvFile(filePath: string): Record<string, string>;
export function resolveGitCommonDir(repoRoot?: string): string | null;
export function pharosApiEnvPaths(repoRoot?: string, commonDir?: string | null): PharosApiEnvPaths;
export function discoverPharosApiConfig(repoRoot?: string): PharosApiConfig;
export function discoverLocalPharosApiKey(repoRoot?: string): LocalPharosApiKeyStatus;
export function loadWorktreeSharedPharosEnv(repoRoot?: string): Record<string, string>;
