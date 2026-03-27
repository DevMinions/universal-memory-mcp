/**
 * memory_compact Tool
 *
 * Compact duplicate low-value memories by archiving redundant entries.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";
import { parseSmartMetadata } from "../core/smart-metadata.js";

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function registerCompactTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_compact",
    "Compact duplicate low-value memories by archiving redundant entries and linking them to a canonical memory. " +
      "Use dryRun=true (default) to preview before applying.",
    {
      scope: z.string().optional().describe("Optional scope filter"),
      dry_run: z
        .boolean()
        .optional()
        .default(true)
        .describe("Preview compaction only (default: true)"),
      limit: z
        .number()
        .optional()
        .default(200)
        .describe("Max entries to scan (default: 200)"),
    },
    async ({ scope, dry_run, limit }) => {
      const safeLimit = Math.min(Math.max(limit, 20), 1000);
      const scopeFilter = scope ? [scope] : undefined;

      const entries = await core.store.list(scopeFilter, undefined, safeLimit, 0);
      const canonicalByKey = new Map<string, (typeof entries)[number]>();
      const duplicates: Array<{
        duplicateId: string;
        canonicalId: string;
        key: string;
      }> = [];

      for (const entry of entries) {
        const meta = parseSmartMetadata(entry.metadata, entry);
        if (meta.state === "archived") continue;
        const key = `${meta.memory_category}:${normalizeText(meta.l0_abstract || entry.text)}`;
        const existing = canonicalByKey.get(key);
        if (!existing) {
          canonicalByKey.set(key, entry);
          continue;
        }
        const keep = existing.timestamp >= entry.timestamp ? existing : entry;
        const drop = keep.id === existing.id ? entry : existing;
        canonicalByKey.set(key, keep);
        duplicates.push({
          duplicateId: drop.id,
          canonicalId: keep.id,
          key,
        });
      }

      let archivedCount = 0;
      if (!dry_run) {
        for (const item of duplicates) {
          await core.store.patchMetadata(item.duplicateId, {
            state: "archived",
            memory_layer: "archive",
            canonical_id: item.canonicalId,
            archive_reason: "compact_duplicate",
            archived_at: Date.now(),
          });
          archivedCount++;
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              action: dry_run ? "compact_preview" : "compact_applied",
              scanned: entries.length,
              duplicates: duplicates.length,
              archived: archivedCount,
              sample: duplicates.slice(0, 10).map((d) => ({
                duplicateId: d.duplicateId.slice(0, 8),
                canonicalId: d.canonicalId.slice(0, 8),
              })),
              message: dry_run
                ? `Preview: ${duplicates.length} duplicate(s) detected across ${entries.length} entries`
                : `Compacted: archived ${archivedCount} duplicate(s)`,
            }),
          },
        ],
      };
    },
  );
}
