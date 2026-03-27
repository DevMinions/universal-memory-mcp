/**
 * memory_promote Tool
 *
 * Promote a memory to confirmed/durable governance state.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerPromoteTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_promote",
    "Promote a memory into confirmed/durable governance state so it participates in auto-recall. " +
      "Can also demote back to pending or archive.",
    {
      id: z.string().describe("Memory ID to promote"),
      state: z
        .enum(["pending", "confirmed", "archived"])
        .optional()
        .default("confirmed")
        .describe("Target state (default: confirmed)"),
      layer: z
        .enum(["durable", "working", "reflection", "archive"])
        .optional()
        .default("durable")
        .describe("Target memory layer (default: durable)"),
    },
    async ({ id, state, layer }) => {
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

      const now = Date.now();
      const patch: Record<string, unknown> = {
        source: "manual",
        state,
        memory_layer: layer,
        bad_recall_count: 0,
        suppressed_until_turn: 0,
      };

      if (state === "confirmed") {
        patch.last_confirmed_use_at = now;
      }

      const updated = await core.store.patchMetadata(id, patch);
      if (!updated) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "promote_failed",
                message: `Failed to promote memory ${id.slice(0, 8)}`,
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
              action: "promoted",
              id,
              state,
              layer,
              message: `Promoted memory ${id.slice(0, 8)} to state=${state}, layer=${layer}`,
            }),
          },
        ],
      };
    },
  );
}
