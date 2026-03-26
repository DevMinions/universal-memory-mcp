import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerListTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_list",
    "List memories with optional filtering by scope, category. Supports pagination.",
    {
      scope: z.string().optional().describe("Filter by scope"),
      category: z.string().optional().describe("Filter by category"),
      limit: z.number().optional().default(20).describe("Max results (1-100)"),
      offset: z.number().optional().default(0).describe("Pagination offset"),
    },
    async ({ scope, category, limit, offset }) => {
      try {
        const safeLimit = Math.min(100, Math.max(1, Math.floor(limit ?? 20)));
        const safeOffset = Math.max(0, Math.floor(offset ?? 0));
        const scopeFilter = scope ? [scope] : undefined;

        const memories = await core.store.list(scopeFilter, category, safeLimit, safeOffset);

        const formatted = memories.map((m) => ({
          id: m.id,
          text: m.text.length > 100 ? m.text.slice(0, 97) + "..." : m.text,
          category: m.category,
          scope: m.scope,
          importance: m.importance,
          timestamp: new Date(m.timestamp).toISOString(),
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ count: formatted.length, offset: safeOffset, memories: formatted }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory list failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
