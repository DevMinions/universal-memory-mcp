/**
 * Configuration Loader
 *
 * Loads config from JSON file with environment variable substitution.
 * Priority: env vars > config.json > config.default.json
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");

export interface FullConfig {
  dbPath: string;
  embedding: {
    provider?: string;
    apiKey: string;
    model: string;
    baseURL: string;
    dimensions: number;
    taskQuery?: string;
    taskPassage?: string;
    normalized?: boolean;
    chunking?: boolean;
  };
  llm: {
    apiKey: string;
    model: string;
    baseURL: string;
    timeoutMs?: number;
  };
  retrieval: {
    mode: string;
    vectorWeight: number;
    bm25Weight: number;
    minScore: number;
    hardMinScore: number;
    rerank: string;
    rerankProvider: string;
    rerankModel: string;
    rerankEndpoint: string;
    rerankApiKey: string;
    candidatePoolSize: number;
    recencyHalfLifeDays: number;
    recencyWeight: number;
    filterNoise: boolean;
    lengthNormAnchor: number;
    timeDecayHalfLifeDays?: number;
    reinforcementFactor?: number;
    maxHalfLifeMultiplier?: number;
  };
  decay: {
    recencyHalfLifeDays: number;
    recencyWeight: number;
    frequencyWeight: number;
    intrinsicWeight: number;
    staleThreshold: number;
    searchBoostMin: number;
    importanceModulation: number;
    betaCore: number;
    betaWorking: number;
    betaPeripheral: number;
    coreDecayFloor: number;
    workingDecayFloor: number;
    peripheralDecayFloor: number;
  };
  tier: {
    coreAccessThreshold: number;
    coreCompositeThreshold: number;
    coreImportanceThreshold: number;
    workingAccessThreshold: number;
    workingCompositeThreshold: number;
    peripheralCompositeThreshold: number;
    peripheralAgeDays: number;
  };
  admissionControl?: {
    enabled: boolean;
    preset?: string;
    utilityMode?: string;
    rejectThreshold?: number;
    admitThreshold?: number;
    noveltyCandidatePoolSize?: number;
    auditMetadata?: boolean;
    persistRejectedAudits?: boolean;
    recency?: { halfLifeDays?: number };
    weights?: Record<string, number>;
    typePriors?: Record<string, number>;
  };
  smartExtraction?: boolean;
  extractMinMessages?: number;
  extractMaxChars?: number;
  selfImprovement?: { enabled?: boolean };
}

/**
 * Recursively substitute ${ENV_VAR} placeholders in strings with env values.
 */
function substituteEnvVars(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\$\{([^}]+)\}/g, (_match, varName) => {
      return process.env[varName] || "";
    });
  }
  if (Array.isArray(obj)) {
    return obj.map(substituteEnvVars);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = substituteEnvVars(value);
    }
    return result;
  }
  return obj;
}

/**
 * Expand ~ to home directory in path strings.
 */
function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(homedir(), p.slice(1));
  }
  return p;
}

/**
 * Deep merge: target values overwritten by source values.
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] !== null &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Load configuration with the following priority:
 * 1. Environment variable overrides (JINA_API_KEY, LLM_API_KEY, etc.)
 * 2. User config file (MCP_CONFIG_PATH or ./config.json)
 * 3. Default config (config.default.json in project root)
 */
export function loadConfig(): FullConfig {
  // 1. Load defaults
  const defaultPath = join(PROJECT_ROOT, "config.default.json");
  let config: Record<string, unknown> = {};
  if (existsSync(defaultPath)) {
    config = JSON.parse(readFileSync(defaultPath, "utf-8"));
  }

  // 2. Merge user config if exists
  const userConfigPath = process.env.MCP_CONFIG_PATH || join(PROJECT_ROOT, "config.json");
  if (existsSync(userConfigPath)) {
    const userConfig = JSON.parse(readFileSync(userConfigPath, "utf-8"));
    config = deepMerge(config, userConfig);
    console.error(`[config] Loaded user config from: ${userConfigPath}`);
  }

  // 3. Substitute ${ENV_VAR} placeholders
  config = substituteEnvVars(config) as Record<string, unknown>;

  // 4. Apply direct env var overrides (highest priority)
  const envOverrides: Record<string, unknown> = {};

  if (process.env.MEMORY_DB_PATH) envOverrides.dbPath = process.env.MEMORY_DB_PATH;

  if (process.env.JINA_API_KEY || process.env.EMBEDDING_MODEL || process.env.EMBEDDING_BASE_URL || process.env.EMBEDDING_DIMENSIONS) {
    const emb = (config.embedding || {}) as Record<string, unknown>;
    envOverrides.embedding = {
      ...emb,
      ...(process.env.JINA_API_KEY && { apiKey: process.env.JINA_API_KEY }),
      ...(process.env.EMBEDDING_MODEL && { model: process.env.EMBEDDING_MODEL }),
      ...(process.env.EMBEDDING_BASE_URL && { baseURL: process.env.EMBEDDING_BASE_URL }),
      ...(process.env.EMBEDDING_DIMENSIONS && { dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS, 10) }),
    };
  }

  if (process.env.LLM_API_KEY || process.env.LLM_MODEL || process.env.LLM_BASE_URL) {
    const llm = (config.llm || {}) as Record<string, unknown>;
    envOverrides.llm = {
      ...llm,
      ...(process.env.LLM_API_KEY && { apiKey: process.env.LLM_API_KEY }),
      ...(process.env.LLM_MODEL && { model: process.env.LLM_MODEL }),
      ...(process.env.LLM_BASE_URL && { baseURL: process.env.LLM_BASE_URL }),
    };
  }

  // Also sync rerank API key with JINA_API_KEY if not separately set
  if (process.env.JINA_API_KEY) {
    const ret = (config.retrieval || {}) as Record<string, unknown>;
    if (!ret.rerankApiKey || ret.rerankApiKey === "") {
      envOverrides.retrieval = { ...ret, rerankApiKey: process.env.JINA_API_KEY };
    }
  }

  if (Object.keys(envOverrides).length > 0) {
    config = deepMerge(config, envOverrides);
  }

  // 5. Expand ~ in paths
  if (typeof config.dbPath === "string") {
    config.dbPath = expandHome(config.dbPath);
  }

  // 6. Validate required fields
  const emb = config.embedding as Record<string, unknown> | undefined;
  if (!emb?.apiKey) {
    throw new Error(
      "Embedding API key is required.\n" +
      "  Set JINA_API_KEY env var, or configure embedding.apiKey in config.json\n" +
      '  export JINA_API_KEY="jina_xxx"',
    );
  }

  return config as unknown as FullConfig;
}
