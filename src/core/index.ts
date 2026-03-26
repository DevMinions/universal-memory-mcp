/**
 * Core Layer - Initialization Orchestrator
 * 
 * Creates and configures all core modules from environment variables.
 */

import { MemoryStore, type StoreConfig } from "./store.js";
import { MemoryRetriever, DEFAULT_RETRIEVAL_CONFIG, type RetrievalConfig } from "./retriever.js";
import { Embedder, getVectorDimensions, type EmbeddingConfig } from "./embedder.js";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface MemoryCoreConfig {
  dbPath?: string;
  embedding: EmbeddingConfig;
  retrieval?: Partial<RetrievalConfig>;
}

export interface MemoryCore {
  store: MemoryStore;
  retriever: MemoryRetriever;
  embedder: Embedder;
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

  const retrievalConfig: RetrievalConfig = {
    ...DEFAULT_RETRIEVAL_CONFIG,
    ...config.retrieval,
  };
  const retriever = new MemoryRetriever(store, embedder, retrievalConfig, null);

  return { store, retriever, embedder };
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
      vectorWeight: 0.75,
      bm25Weight: 0.25,
      minScore: 0.6,
      hardMinScore: 0.72,
      rerank: "cross-encoder",
      rerankApiKey: apiKey,
      rerankProvider: "jina",
      rerankModel: "jina-reranker-v3",
      rerankEndpoint: "https://api.jina.ai/v1/rerank",
      candidatePoolSize: 50,
      recencyHalfLifeDays: 10,
      recencyWeight: 0.25,
      filterNoise: true,
      lengthNormAnchor: 400,
    },
  });
}

// ============================================================================
// Re-exports
// ============================================================================

export { MemoryStore, type MemoryEntry, type MemorySearchResult } from "./store.js";
export { MemoryRetriever, type RetrievalConfig, type RetrievalResult } from "./retriever.js";
export { Embedder, type EmbeddingConfig } from "./embedder.js";
