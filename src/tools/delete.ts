import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerDeleteTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_delete",
    "Delete a memory by ID (full UUID or 8+ character prefix).",
    {
      id: z.string().describe("Memory ID (full UUID or 8+ char prefix)"),
    },
    async ({ id }) => {
      try {
        const deleted = await core.store.delete(id);
        if (!deleted) {
          return {
            content: [{ type: "text" as const, text: `Memory not found: ${id}` }],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ status: "deleted", id }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory delete failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
