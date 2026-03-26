import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerForgetTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_forget",
    "Bulk delete memories by scope and/or before a timestamp. Requires at least one filter for safety.",
    {
      scope: z.string().describe("Scope to delete from"),
      beforeDate: z.string().optional().describe("Delete memories before this ISO date (e.g. 2026-01-01)"),
    },
    async ({ scope, beforeDate }) => {
      try {
        const beforeTimestamp = beforeDate ? new Date(beforeDate).getTime() : undefined;
        const deleted = await core.store.bulkDelete([scope], beforeTimestamp);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ status: "deleted", count: deleted, scope, beforeDate }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory forget failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
