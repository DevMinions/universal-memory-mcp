/**
 * Web Dashboard REST API
 * 
 * Provides HTTP endpoints for the web management panel.
 * Reuses MemoryCore logic — no duplicate implementation.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { MemoryCore } from "../core/index.js";
import { getCronLogs } from "../cron/scheduler.js";
import { createBackup, listBackups, restoreBackup, type BackupConfig, DEFAULT_BACKUP_CONFIG } from "../backup/backup-manager.js";
import { loadConfig } from "../core/config-loader.js";
import { homedir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

interface ApiContext {
  core: MemoryCore;
}

// ============================================================================
// Helpers
// ============================================================================

function jsonResponse(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function errorResponse(res: ServerResponse, status: number, message: string) {
  jsonResponse(res, status, { error: message });
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parseQuery(url: URL): Record<string, string> {
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

// ============================================================================
// API Route Handler
// ============================================================================

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: ApiContext,
): Promise<boolean> {
  const path = url.pathname;
  const method = req.method || "GET";

  // Only handle /api/* routes
  if (!path.startsWith("/api/")) return false;

  try {
    // GET /api/stats
    if (path === "/api/stats" && method === "GET") {
      const query = parseQuery(url);
      const scopeFilter = query.scope ? [query.scope] : undefined;
      const stats = await ctx.core.store.stats(scopeFilter);

      // Tier distribution: parse metadata for each memory
      const all = await ctx.core.store.list(scopeFilter, undefined, 5000, 0);
      const tierCounts: Record<string, number> = { core: 0, working: 0, peripheral: 0 };
      const dailyCounts: Record<string, number> = {};

      for (const mem of all) {
        // Tier stats
        try {
          const meta = JSON.parse(mem.metadata || "{}");
          const tier = (meta.tier as string) || (meta.memory_layer as string) || "working";
          if (tier in tierCounts) {
            tierCounts[tier]++;
          } else {
            tierCounts["working"]++;
          }
        } catch {
          tierCounts["working"]++;
        }

        // Daily growth stats (last 30 days)
        const day = new Date(mem.timestamp).toISOString().split("T")[0];
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      }

      jsonResponse(res, 200, {
        ...stats,
        tierCounts,
        dailyCounts,
      });
      return true;
    }

    // GET /api/memories
    if (path === "/api/memories" && method === "GET") {
      const query = parseQuery(url);
      const scope = query.scope || undefined;
      const category = query.category || undefined;
      const limit = Math.min(100, Math.max(1, parseInt(query.limit || "20", 10)));
      const offset = Math.max(0, parseInt(query.offset || "0", 10));
      const search = query.search || undefined;
      const scopeFilter = scope ? [scope] : undefined;

      if (search) {
        // Use retriever for semantic search
        try {
          const results = await ctx.core.retriever.retrieve({
            query: search,
            limit,
            scopeFilter,
            source: "manual",
          });

          const memories = results.map((r) => ({
            id: r.entry.id,
            text: r.entry.text,
            category: r.entry.category,
            scope: r.entry.scope,
            importance: r.entry.importance,
            timestamp: r.entry.timestamp,
            metadata: r.entry.metadata,
            score: r.score,
          }));

          jsonResponse(res, 200, { count: memories.length, offset: 0, total: memories.length, memories });
        } catch {
          // Fallback to list if search fails
          const memories = await ctx.core.store.list(scopeFilter, category, limit, offset);
          const formatted = formatMemories(memories);
          jsonResponse(res, 200, { count: formatted.length, offset, total: formatted.length, memories: formatted });
        }
      } else {
        const memories = await ctx.core.store.list(scopeFilter, category, limit, offset);
        // Get total count
        const allCount = await ctx.core.store.list(scopeFilter, category, 10000, 0);
        const formatted = formatMemories(memories);
        jsonResponse(res, 200, { count: formatted.length, offset, total: allCount.length, memories: formatted });
      }
      return true;
    }

    // GET /api/memories/:id
    const memoryDetailMatch = path.match(/^\/api\/memories\/([a-f0-9-]+)$/i);
    if (memoryDetailMatch && method === "GET") {
      const id = memoryDetailMatch[1];
      const entry = await ctx.core.store.getById(id);
      if (!entry) {
        errorResponse(res, 404, `Memory not found: ${id}`);
        return true;
      }
      jsonResponse(res, 200, {
        id: entry.id,
        text: entry.text,
        category: entry.category,
        scope: entry.scope,
        importance: entry.importance,
        timestamp: entry.timestamp,
        metadata: entry.metadata,
      });
      return true;
    }

    // PUT /api/memories/:id
    if (memoryDetailMatch && method === "PUT") {
      const id = memoryDetailMatch[1];
      const body = JSON.parse(await readBody(req));
      const updates: Record<string, any> = {};

      if (body.text !== undefined) {
        updates.text = body.text;
        updates.vector = await ctx.core.embedder.embedPassage(body.text);
      }
      if (body.importance !== undefined) updates.importance = body.importance;
      if (body.category !== undefined) updates.category = body.category;

      if (Object.keys(updates).length === 0) {
        errorResponse(res, 400, "No updates provided");
        return true;
      }

      const updated = await ctx.core.store.update(id, updates);
      if (!updated) {
        errorResponse(res, 404, `Memory not found: ${id}`);
        return true;
      }

      jsonResponse(res, 200, {
        status: "updated",
        id: updated.id,
        category: updated.category,
        scope: updated.scope,
        importance: updated.importance,
      });
      return true;
    }

    // DELETE /api/memories/:id
    if (memoryDetailMatch && method === "DELETE") {
      const id = memoryDetailMatch[1];
      const deleted = await ctx.core.store.delete(id);
      if (!deleted) {
        errorResponse(res, 404, `Memory not found: ${id}`);
        return true;
      }
      jsonResponse(res, 200, { status: "deleted", id });
      return true;
    }

    // POST /api/memories/:id/archive
    const archiveMatch = path.match(/^\/api\/memories\/([a-f0-9-]+)\/archive$/i);
    if (archiveMatch && method === "POST") {
      const id = archiveMatch[1];
      const body = JSON.parse(await readBody(req) || "{}");
      const reason = body.reason || "manual_archive";

      const updated = await ctx.core.store.patchMetadata(id, {
        state: "archived",
        memory_layer: "archive",
        archive_reason: reason,
        archived_at: Date.now(),
      });

      if (!updated) {
        errorResponse(res, 404, `Memory not found: ${id}`);
        return true;
      }

      jsonResponse(res, 200, { status: "archived", id, reason });
      return true;
    }

    // POST /api/actions/compact
    if (path === "/api/actions/compact" && method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      const dryRun = body.dryRun !== false; // default true

      const entries = await ctx.core.store.list(undefined, undefined, 1000, 0);
      const canonicalByKey = new Map<string, (typeof entries)[number]>();
      const duplicates: Array<{ duplicateId: string; canonicalId: string }> = [];

      for (const entry of entries) {
        let meta: Record<string, unknown>;
        try { meta = JSON.parse(entry.metadata || "{}"); } catch { meta = {}; }
        if ((meta as any).state === "archived") continue;

        const key = `${entry.category}:${entry.text.replace(/\s+/g, " ").trim().toLowerCase().substring(0, 200)}`;
        const existing = canonicalByKey.get(key);
        if (!existing) {
          canonicalByKey.set(key, entry);
          continue;
        }
        const keep = existing.timestamp >= entry.timestamp ? existing : entry;
        const drop = keep.id === existing.id ? entry : existing;
        canonicalByKey.set(key, keep);
        duplicates.push({ duplicateId: drop.id, canonicalId: keep.id });
      }

      let archived = 0;
      if (!dryRun) {
        for (const item of duplicates) {
          await ctx.core.store.patchMetadata(item.duplicateId, {
            state: "archived",
            memory_layer: "archive",
            archive_reason: "compact_duplicate",
            archived_at: Date.now(),
          });
          archived++;
        }
      }

      jsonResponse(res, 200, {
        action: dryRun ? "compact_preview" : "compact_applied",
        scanned: entries.length,
        duplicates: duplicates.length,
        archived,
      });
      return true;
    }

    // POST /api/actions/reindex
    if (path === "/api/actions/reindex" && method === "POST") {
      const result = await ctx.core.store.rebuildFtsIndex();
      jsonResponse(res, 200, { action: "reindex", ...result });
      return true;
    }

    // GET /api/backups — list available backups
    if (path === "/api/backups" && method === "GET") {
      const cfg = loadConfig() as any;
      const backupConfig: BackupConfig = { ...DEFAULT_BACKUP_CONFIG, ...cfg.backup };
      const backups = listBackups(backupConfig.dir);
      jsonResponse(res, 200, {
        count: backups.length,
        maxBackups: backupConfig.maxBackups,
        backupDir: backupConfig.dir,
        backups: backups.map(b => ({
          ...b,
          sizeMB: Math.round(b.sizeBytes / 1024 / 1024 * 10) / 10,
        })),
      });
      return true;
    }

    // POST /api/actions/backup — create a new backup
    if (path === "/api/actions/backup" && method === "POST") {
      const cfg = loadConfig() as any;
      const backupConfig: BackupConfig = { ...DEFAULT_BACKUP_CONFIG, ...cfg.backup };
      const dbPath = cfg.dbPath
        ? cfg.dbPath.replace(/^~/, homedir())
        : join(homedir(), ".openclaw/memory/lancedb-pro");

      const result = await createBackup(ctx.core, dbPath, backupConfig);
      if (!result.success) {
        errorResponse(res, 500, `Backup failed: ${result.error}`);
        return true;
      }
      jsonResponse(res, 200, {
        action: "backup_created",
        path: result.backupPath,
        memoryCount: result.manifest?.memoryCount,
        sizeMB: Math.round((result.manifest?.sizeBytes || 0) / 1024 / 1024 * 10) / 10,
        cleanedOldBackups: result.cleaned,
      });
      return true;
    }

    // POST /api/actions/restore — restore from a backup
    if (path === "/api/actions/restore" && method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      const cfg = loadConfig() as any;
      const backupConfig: BackupConfig = { ...DEFAULT_BACKUP_CONFIG, ...cfg.backup };
      const dbPath = cfg.dbPath
        ? cfg.dbPath.replace(/^~/, homedir())
        : join(homedir(), ".openclaw/memory/lancedb-pro");

      const result = await restoreBackup(dbPath, backupConfig.dir, body.backupName);
      if (!result.success) {
        errorResponse(res, 500, `Restore failed: ${result.error}`);
        return true;
      }
      jsonResponse(res, 200, {
        action: "restored",
        from: result.restoredFrom,
        memoryCount: result.memoryCount,
        note: "Server restart required to reload the restored database.",
      });
      return true;
    }

    // GET /api/actions/export
    if (path === "/api/actions/export" && method === "GET") {
      const query = parseQuery(url);
      const scope = query.scope || undefined;
      const category = query.category || undefined;
      const limit = Math.min(5000, Math.max(1, parseInt(query.limit || "1000", 10)));
      const scopeFilter = scope ? [scope] : undefined;

      const memories = await ctx.core.store.list(scopeFilter, category, limit, 0);
      const exported = memories.map((m) => ({
        id: m.id,
        text: m.text,
        category: m.category,
        scope: m.scope,
        importance: m.importance,
        timestamp: m.timestamp,
        metadata: m.metadata,
      }));

      // Set download headers
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="memories-export-${new Date().toISOString().split("T")[0]}.json"`,
      });
      res.end(JSON.stringify({ count: exported.length, exportedAt: new Date().toISOString(), memories: exported }, null, 2));
      return true;
    }

    // GET /api/cron/logs
    if (path === "/api/cron/logs" && method === "GET") {
      const query = parseQuery(url);
      const limit = Math.min(200, Math.max(1, parseInt(query.limit || "50", 10)));
      const logs = getCronLogs(limit);
      jsonResponse(res, 200, { count: logs.length, logs });
      return true;
    }

    // 404 for unknown API routes
    errorResponse(res, 404, `API endpoint not found: ${method} ${path}`);
    return true;

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorResponse(res, 500, message);
    return true;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function formatMemories(memories: Array<{
  id: string;
  text: string;
  category: string;
  scope: string;
  importance: number;
  timestamp: number;
  metadata?: string;
}>) {
  return memories.map((m) => ({
    id: m.id,
    text: m.text,
    category: m.category,
    scope: m.scope,
    importance: m.importance,
    timestamp: m.timestamp,
    metadata: m.metadata,
  }));
}
