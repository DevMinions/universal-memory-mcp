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
 * Create MemoryCore from environment variables.
 * 
 * Required env vars:
 *   JINA_API_KEY - Jina API key for embedding and reranking
 * 
 * Optional env vars:
 *   MEMORY_DB_PATH      - LanceDB database path (default: ~/.openclaw/memory/lancedb-pro)
 *   EMBEDDING_MODEL     - Embedding model name (default: jina-embeddings-v3)
 *   EMBEDDING_BASE_URL  - Embedding API base URL (default: https://api.jina.ai/v1)
 *   EMBEDDING_DIMENSIONS - Vector dimensions (default: 1024)
 */
export function createMemoryCoreFromEnv(): MemoryCore {
  const apiKey = process.env.JINA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "JINA_API_KEY environment variable is required.\n" +
      "  Set it in your MCP client config or export it:\n" +
      '  export JINA_API_KEY="jina_xxx"'
    );
  }

  // LLM client config — prefer env var, fall back to OpenRouter free endpoint from OpenClaw config
  const llmApiKey = process.env.LLM_API_KEY || "OPENROUTER_API_KEY_REDACTED";
  const llmConfig: Partial<LlmClientConfig> = {
    apiKey: llmApiKey,
    model: process.env.LLM_MODEL || "openrouter/free",
    baseURL: process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
    timeoutMs: 60000,
  };

  return createMemoryCore({
    dbPath: process.env.MEMORY_DB_PATH || join(homedir(), ".openclaw/memory/lancedb-pro"),
    embedding: {
      provider: "openai-compatible",
      apiKey,
      model: process.env.EMBEDDING_MODEL || "jina-embeddings-v3",
      baseURL: process.env.EMBEDDING_BASE_URL || "https://api.jina.ai/v1",
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || "1024", 10),
      taskQuery: "retrieval.query",
      taskPassage: "retrieval.passage",
      normalized: true,
      chunking: true,
    },
    retrieval: {
      mode: "hybrid",
      vectorWeight: 0.7,
      bm25Weight: 0.3,
      minScore: 0.6,
      hardMinScore: 0.62,
      rerank: "cross-encoder",
      rerankApiKey: apiKey,
      rerankProvider: "jina",
      rerankModel: "jina-reranker-v3",
      rerankEndpoint: "https://api.jina.ai/v1/rerank",
      candidatePoolSize: 12,
      recencyHalfLifeDays: 14,
      recencyWeight: 0.1,
      filterNoise: true,
      lengthNormAnchor: 500,
    },
    decay: {
      recencyHalfLifeDays: 30,
      recencyWeight: 0.4,
      frequencyWeight: 0.35,
      intrinsicWeight: 0.25,
      staleThreshold: 0.25,
      searchBoostMin: 0.25,
      importanceModulation: 2,
      betaCore: 0.6,
      betaWorking: 0.9,
      betaPeripheral: 1.2,
      coreDecayFloor: 0.95,
      workingDecayFloor: 0.75,
      peripheralDecayFloor: 0.4,
    },
    tier: {
      coreAccessThreshold: 8,
      coreCompositeThreshold: 0.75,
      coreImportanceThreshold: 0.85,
      workingAccessThreshold: 2,
      workingCompositeThreshold: 0.45,
      peripheralCompositeThreshold: 0.2,
      peripheralAgeDays: 45,
    },
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
