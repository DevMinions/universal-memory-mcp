import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";

interface ImportMemory {
  text: string;
  category?: string;
  scope?: string;
  importance?: number;
  timestamp?: number | string;
  metadata?: Record<string, unknown>;
}

export function registerImportTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_import",
    "Import memories from JSON data. Accepts an array of memory objects with text, category, scope, importance fields. Generates embeddings for each imported memory.",
    {
      memories: z.string().describe("JSON string of memory array. Each item: {text, category?, scope?, importance?, metadata?}"),
      dryRun: z.boolean().optional().default(false).describe("Preview import without actually storing (default: false)"),
    },
    async ({ memories: memoriesJson, dryRun }) => {
      try {
        let items: ImportMemory[];
        try {
          const parsed = JSON.parse(memoriesJson);
          // Support both { memories: [...] } and bare [...]
          items = Array.isArray(parsed) ? parsed : (parsed.memories || []);
        } catch {
          return { content: [{ type: "text" as const, text: "Invalid JSON input. Expected array of memory objects." }] };
        }

        if (!Array.isArray(items) || items.length === 0) {
          return { content: [{ type: "text" as const, text: "No memories to import." }] };
        }

        // Limit batch size
        const MAX_IMPORT = 500;
        if (items.length > MAX_IMPORT) {
          return { content: [{ type: "text" as const, text: `Too many items (${items.length}). Max per batch: ${MAX_IMPORT}` }] };
        }

        // Validate
        const validItems: ImportMemory[] = [];
        const errors: string[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item.text || typeof item.text !== "string" || item.text.trim().length < 3) {
            errors.push(`Item ${i}: missing or too short text`);
            continue;
          }
          validItems.push(item);
        }

        if (dryRun) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                dryRun: true,
                validCount: validItems.length,
                errorCount: errors.length,
                errors: errors.slice(0, 10),
                sampleItems: validItems.slice(0, 3).map(i => ({
                  text: i.text.substring(0, 100),
                  category: i.category || "fact",
                  scope: i.scope || "global",
                  importance: i.importance || 0.7,
                })),
              }, null, 2),
            }],
          };
        }

        // Actually import
        let imported = 0;
        let failed = 0;

        for (const item of validItems) {
          try {
            const embedding = await core.embedder.embed(item.text);
            await core.store.store({
              text: item.text,
              category: item.category || "fact",
              scope: item.scope || "global",
              importance: item.importance ?? 0.7,
              vector: embedding,
              metadata: item.metadata ? JSON.stringify(item.metadata) : undefined,
            });
            imported++;
          } catch (e) {
            failed++;
            if (failed <= 3) {
              errors.push(`Import failed for "${item.text.substring(0, 50)}": ${(e as Error).message}`);
            }
          }
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: "import_complete",
              imported,
              failed,
              skipped: items.length - validItems.length,
              errors: errors.slice(0, 10),
            }, null, 2),
          }],
        };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Import error: ${(e as Error).message}` }] };
      }
    },
  );
}
