/**
 * Core Layer - Initialization Orchestrator
 * 
 * Creates and configures all core modules from environment variables.
 */

import { MemoryStore, type StoreConfig } from "./store.js";
import { MemoryRetriever, DEFAULT_RETRIEVAL_CONFIG, type RetrievalConfig } from "./retriever.js";
import { Embedder, getVectorDimensions, type EmbeddingConfig } from "./embedder.js";
import { createDecayEngine, type DecayConfig, DEFAULT_DECAY_CONFIG } from "./decay-engine.js";
import { createTierManager, type TierConfig, DEFAULT_TIER_CONFIG } from "./tier-manager.js";
import { AccessTracker } from "./access-tracker.js";
import { createLlmClient, type LlmClient, type LlmClientConfig } from "./llm-client.js";
import { loadConfig } from "./config-loader.js";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface MemoryCoreConfig {
  dbPath?: string;
  embedding: EmbeddingConfig;
  retrieval?: Partial<RetrievalConfig>;
  decay?: Partial<DecayConfig>;
  tier?: Partial<TierConfig>;
  enableLifecycle?: boolean;
  llm?: Partial<LlmClientConfig>;
}

export interface MemoryCore {
  store: MemoryStore;
  retriever: MemoryRetriever;
  embedder: Embedder;
  accessTracker: AccessTracker | null;
  llmClient: LlmClient | null;
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createMemoryCore(config: MemoryCoreConfig): MemoryCore {
  const dbPath = config.dbPath || join(homedir(), ".openclaw/memory/lancedb-pro");
  const dimensions = getVectorDimensions(config.embedding.model, config.embedding.dimensions);

  const embedder = new Embedder(config.embedding);

  const storeConfig: StoreConfig = {
    dbPath,
    vectorDim: dimensions,
  };
  const store = new MemoryStore(storeConfig);

  // Lifecycle modules (decay, tier, access tracking)
  const enableLifecycle = config.enableLifecycle !== false;
  let decayEngine = null;
  let tierManager = null;
  let accessTracker: AccessTracker | null = null;

  if (enableLifecycle) {
    const decayConfig: DecayConfig = { ...DEFAULT_DECAY_CONFIG, ...config.decay };
    const tierConfig: TierConfig = { ...DEFAULT_TIER_CONFIG, ...config.tier };
    decayEngine = createDecayEngine(decayConfig);
    tierManager = createTierManager(tierConfig);
    accessTracker = new AccessTracker({
      store,
      logger: { warn: (...args) => console.error("[access-tracker]", ...args) },
      debounceMs: 5_000,
    });
  }

  const retrievalConfig: RetrievalConfig = {
    ...DEFAULT_RETRIEVAL_CONFIG,
    ...config.retrieval,
  };
  const retriever = new MemoryRetriever(store, embedder, retrievalConfig, accessTracker, decayEngine, tierManager);

  // LLM client (optional)
  let llmClient: LlmClient | null = null;
  if (config.llm?.apiKey) {
    llmClient = createLlmClient({
      apiKey: config.llm.apiKey,
      model: config.llm.model || "gpt-4o-mini",
      baseURL: config.llm.baseURL,
      timeoutMs: config.llm.timeoutMs,
      log: config.llm.log,
    });
  }

  return { store, retriever, embedder, accessTracker, llmClient };
}

/**
 * Create MemoryCore from config file + environment variables.
 * 
 * Config priority: env vars > config.json > config.default.json
 * 
 * See config.default.json for all available options.
 * Create a config.json to override any setting.
 * Set MCP_CONFIG_PATH to use a custom config file path.
 */
export function createMemoryCoreFromEnv(): MemoryCore {
  const cfg = loadConfig();

  const llmConfig: Partial<LlmClientConfig> | undefined = cfg.llm?.apiKey
    ? {
        apiKey: cfg.llm.apiKey,
        model: cfg.llm.model,
        baseURL: cfg.llm.baseURL,
        timeoutMs: cfg.llm.timeoutMs,
      }
    : undefined;

  return createMemoryCore({
    dbPath: cfg.dbPath,
    embedding: {
      provider: (cfg.embedding.provider || "openai-compatible") as "openai-compatible",
      apiKey: cfg.embedding.apiKey,
      model: cfg.embedding.model,
      baseURL: cfg.embedding.baseURL,
      dimensions: cfg.embedding.dimensions,
      taskQuery: cfg.embedding.taskQuery,
      taskPassage: cfg.embedding.taskPassage,
      normalized: cfg.embedding.normalized,
      chunking: cfg.embedding.chunking,
    },
    retrieval: cfg.retrieval as Partial<RetrievalConfig>,
    decay: cfg.decay,
    tier: cfg.tier,
    llm: llmConfig,
  });
}

// ============================================================================
// Re-exports
// ============================================================================

export { MemoryStore, type MemoryEntry, type MemorySearchResult } from "./store.js";
export { MemoryRetriever, type RetrievalConfig, type RetrievalResult } from "./retriever.js";
export { Embedder, type EmbeddingConfig } from "./embedder.js";
export { createDecayEngine, type DecayConfig, type DecayEngine, type DecayableMemory } from "./decay-engine.js";
export { createTierManager, type TierConfig, type TierManager } from "./tier-manager.js";
export { AccessTracker } from "./access-tracker.js";
export { createLlmClient, type LlmClient, type LlmClientConfig } from "./llm-client.js";
export { buildExtractionPrompt, buildDedupPrompt, buildMergePrompt } from "./extraction-prompts.js";
