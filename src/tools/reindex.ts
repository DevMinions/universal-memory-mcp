import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryCore } from "../core/index.js";

export function registerReindexTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_reindex",
    "Rebuild the FTS (full-text search) index. Use when search results seem stale or corrupted.",
    {},
    async () => {
      try {
        const result = await core.store.rebuildFtsIndex();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Reindex failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
