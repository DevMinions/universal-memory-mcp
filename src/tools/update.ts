import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

export function registerUpdateTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_update",
    "Update an existing memory's text, importance, or category. Generates new embedding if text is changed.",
    {
      id: z.string().describe("Memory ID to update"),
      text: z.string().optional().describe("New text content"),
      importance: z.number().min(0).max(1).optional().describe("New importance score"),
      category: z
        .enum(["preference", "fact", "decision", "entity", "reflection", "other"])
        .optional()
        .describe("New category"),
    },
    async ({ id, text, importance, category }) => {
      try {
        const updates: Record<string, any> = {};
        if (text !== undefined) {
          updates.text = text;
          updates.vector = await core.embedder.embedPassage(text);
        }
        if (importance !== undefined) updates.importance = importance;
        if (category !== undefined) updates.category = category;

        if (Object.keys(updates).length === 0) {
          return {
            content: [{ type: "text" as const, text: "No updates provided." }],
          };
        }

        const updated = await core.store.update(id, updates);
        if (!updated) {
          return {
            content: [{ type: "text" as const, text: `Memory not found: ${id}` }],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "updated",
                id: updated.id,
                category: updated.category,
                scope: updated.scope,
                importance: updated.importance,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Memory update failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
