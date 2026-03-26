import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";
import { isNoise } from "../core/noise-filter.js";
import { buildSmartMetadata, stringifySmartMetadata } from "../core/smart-metadata.js";

export function registerStoreTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_store",
    "Store a new memory with auto-embedding. Checks for duplicates before storing.",
    {
      text: z.string().describe("Memory content to store"),
      category: z
        .enum(["preference", "fact", "decision", "entity", "reflection", "other"])
        .optional()
        .default("fact")
        .describe("Memory category"),
      scope: z.string().optional().default("global").describe("Memory scope"),
      importance: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.7)
        .describe("Importance score 0-1"),
    },
    async ({ text, category, scope, importance }) => {
      try {
        // Reject noise
        if (isNoise(text)) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Skipped: text detected as noise (greeting, boilerplate, or meta-question)",
              },
            ],
          };
        }

        const safeImportance = Math.min(1, Math.max(0, importance ?? 0.7));
        const vector = await core.embedder.embedPassage(text);

        // Check for duplicates
        let existing: Awaited<ReturnType<typeof core.store.vectorSearch>> = [];
        try {
          existing = await core.store.vectorSearch(vector, 1, 0.1, [scope ?? "global"], {
            excludeInactive: true,
          });
        } catch {
          // fail-open: dedup must never block a legitimate write
        }

        if (existing.length > 0 && existing[0].score > 0.98) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Similar memory already exists (similarity: ${existing[0].score.toFixed(3)}): "${existing[0].entry.text.slice(0, 100)}..."`,
              },
            ],
          };
        }

        const metadata = buildSmartMetadata(
          { text, category: category as any, importance: safeImportance },
          {
            source: "manual",
            state: "confirmed",
            memory_layer: "durable",
          }
        );

        const entry = await core.store.store({
          text,
          vector,
          importance: safeImportance,
          category: category as any,
          scope: scope ?? "global",
          metadata: stringifySmartMetadata(metadata),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "stored",
                id: entry.id,
                category,
                scope: entry.scope,
                importance: entry.importance,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory store failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
