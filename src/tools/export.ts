import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerExportTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_export",
    "Export memories as JSON. Returns memory data without vector embeddings.",
    {
      scope: z.string().optional().describe("Filter by scope"),
      category: z.string().optional().describe("Filter by category"),
      limit: z.number().optional().default(100).describe("Max memories to export (1-1000)"),
    },
    async ({ scope, category, limit }) => {
      try {
        const safeLimit = Math.min(1000, Math.max(1, Math.floor(limit ?? 100)));
        const scopeFilter = scope ? [scope] : undefined;

        const memories = await core.store.list(scopeFilter, category, safeLimit, 0);

        const exported = memories.map((m) => ({
          id: m.id,
          text: m.text,
          category: m.category,
          scope: m.scope,
          importance: m.importance,
          timestamp: m.timestamp,
          metadata: m.metadata,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ count: exported.length, memories: exported }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Export failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
