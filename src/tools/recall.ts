import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";
import { parseSmartMetadata } from "../core/smart-metadata.js";

export function registerRecallTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_recall",
    "Search memories using hybrid retrieval (vector + BM25 + rerank). Returns relevant memories sorted by relevance.",
    {
      query: z.string().describe("Search query for finding relevant memories"),
      scope: z.string().optional().default("global").describe("Memory scope to search in"),
      limit: z.number().optional().default(5).describe("Max number of results (1-20)"),
    },
    async ({ query, scope, limit }) => {
      try {
        const safeLimit = Math.min(20, Math.max(1, Math.floor(limit ?? 5)));

        const results = await core.retriever.retrieve({
          query,
          limit: safeLimit,
          scopeFilter: scope ? [scope] : undefined,
          source: "manual",
        });

        if (results.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No relevant memories found." }],
          };
        }

        const formatted = results.map((r, i) => {
          const meta = parseSmartMetadata(r.entry.metadata, r.entry);
          const abstract = meta.l0_abstract || r.entry.text;
          const preview = abstract.length > 200 ? abstract.slice(0, 197) + "..." : abstract;
          return `${i + 1}. [${r.entry.id}] [${r.entry.category}/${r.entry.scope}] (score: ${r.score.toFixed(2)})\n   ${preview}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${results.length} memories:\n\n${formatted.join("\n\n")}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory recall failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
