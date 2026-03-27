/**
 * memory_explain_rank Tool
 *
 * Run recall and explain why each memory was ranked,
 * including governance metadata (state/layer/source/suppression).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";
import { parseSmartMetadata } from "../core/smart-metadata.js";

export function registerExplainRankTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_explain_rank",
    "Run recall and explain why each memory was ranked, including governance metadata " +
      "(state, layer, source, tier, access count, suppression status).",
    {
      query: z.string().describe("Query used for ranking analysis"),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("How many items to explain (default: 5)"),
      scope: z.string().optional().describe("Optional scope filter"),
    },
    async ({ query, limit, scope }) => {
      const safeLimit = Math.min(Math.max(limit, 1), 20);
      const scopeFilter = scope ? [scope] : undefined;

      const queryVector = await core.embedder.embed(query);
      if (!queryVector || queryVector.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "embedding_failed", message: "Failed to embed query" }),
            },
          ],
          isError: true,
        };
      }

      const results = await core.store.vectorSearch(queryVector, safeLimit, 0.0, scopeFilter);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                query,
                count: 0,
                message: "No relevant memories found",
              }),
            },
          ],
        };
      }

      const explained = results.map((r, idx) => {
        const meta = parseSmartMetadata(r.entry.metadata, r.entry);
        return {
          rank: idx + 1,
          id: r.entry.id,
          score: Number(r.score.toFixed(4)),
          text: (meta.l0_abstract || r.entry.text).slice(0, 200),
          governance: {
            state: meta.state,
            layer: meta.memory_layer,
            source: meta.source,
            tier: meta.tier,
            memory_category: meta.memory_category,
            access_count: meta.access_count,
            injected_count: meta.injected_count,
            bad_recall_count: meta.bad_recall_count,
            suppressed_until_turn: meta.suppressed_until_turn,
            confidence: meta.confidence,
          },
        };
      });

      const lines = explained.map(
        (e) =>
          `${e.rank}. [${e.id.slice(0, 8)}] score=${e.score} state=${e.governance.state} layer=${e.governance.layer} tier=${e.governance.tier}\n   ${e.text.slice(0, 120)}`,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              query,
              count: explained.length,
              results: explained,
              summary: lines.join("\n"),
            }),
          },
        ],
      };
    },
  );
}
