import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerStatsTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_stats",
    "Get memory statistics: total count, counts by scope and category.",
    {
      scope: z.string().optional().describe("Filter stats by scope"),
    },
    async ({ scope }) => {
      try {
        const scopeFilter = scope ? [scope] : undefined;
        const stats = await core.store.stats(scopeFilter);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory stats failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
