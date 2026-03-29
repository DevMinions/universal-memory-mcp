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
        // Resolve ID prefix
        const existing = await core.store.getById(id);
        if (!existing) {
          return {
            content: [{ type: "text" as const, text: `Memory not found: ${id}` }],
          };
        }

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

        // Supersede logic: for preference/entity text updates, create new version
        const effectiveCategory = category || existing.category;
        const isVersioned = (effectiveCategory === "preference" || effectiveCategory === "entity");
        const hasTextChange = text !== undefined && text !== existing.text;

        if (isVersioned && hasTextChange) {
          // 1. Mark original as superseded
          await core.store.patchMetadata(existing.id, {
            state: "superseded",
            superseded_at: Date.now(),
            superseded_by: "pending", // will be updated after new entry created
          });

          // 2. Create new versioned entry
          const vector = await core.embedder.embedPassage(text!);
          const newEntry = await core.store.store({
            text: text!,
            category: effectiveCategory,
            scope: existing.scope,
            importance: importance ?? existing.importance,
            vector,
            metadata: JSON.stringify({
              ...(existing.metadata ? JSON.parse(existing.metadata) : {}),
              supersedes: existing.id,
              version_source: "memory_update",
            }),
          });

          // 3. Update original's superseded_by pointer
          await core.store.patchMetadata(existing.id, {
            superseded_by: newEntry.id,
          });

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                status: "superseded",
                originalId: existing.id,
                newId: newEntry.id,
                category: effectiveCategory,
                scope: existing.scope,
                note: `Created new version (${effectiveCategory} supersede). Original preserved.`,
              }),
            }],
          };
        }

        // Normal update (non-versioned categories or non-text changes)
        const updated = await core.store.update(existing.id, updates);
        if (!updated) {
          return {
            content: [{ type: "text" as const, text: `Update failed for: ${id}` }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: "updated",
              id: updated.id,
              category: updated.category,
              scope: updated.scope,
              importance: updated.importance,
            }),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Memory update failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
