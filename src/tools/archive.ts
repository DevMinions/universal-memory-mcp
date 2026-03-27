/**
 * memory_archive Tool
 *
 * Archive a memory to remove it from default auto-recall while preserving history.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerArchiveTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_archive",
    "Archive a memory to remove it from default auto-recall while preserving history. " +
      "Archived memories are still searchable but excluded from automatic injection.",
    {
      id: z.string().describe("Memory ID to archive"),
      reason: z
        .string()
        .optional()
        .default("manual_archive")
        .describe("Archive reason for audit trail"),
    },
    async ({ id, reason }) => {
      const entry = await core.store.getById(id);
      if (!entry) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "not_found",
                message: `Memory ${id.slice(0, 8)}... not found`,
              }),
            },
          ],
          isError: true,
        };
      }

      const patch = {
        state: "archived" as const,
        memory_layer: "archive" as const,
        archive_reason: reason,
        archived_at: Date.now(),
      };

      const updated = await core.store.patchMetadata(id, patch);
      if (!updated) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "archive_failed",
                message: `Failed to archive memory ${id.slice(0, 8)}`,
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              action: "archived",
              id,
              reason,
              message: `Archived memory ${id.slice(0, 8)}`,
            }),
          },
        ],
      };
    },
  );
}
