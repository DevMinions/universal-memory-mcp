/**
 * Cron Scheduler — 定时自动维护记忆库
 *
 * 支持的任务：
 * - compact:       去重压缩（发现并归档重复记忆）
 * - tierDowngrade:  降级过期记忆（peripheral 超龄 → 归档）
 * - reindex:       重建 FTS 索引
 */

import cron from "node-cron";
import type { MemoryCore } from "../core/index.js";

export interface CronConfig {
  enabled: boolean;
  compact?: string;        // cron 表达式, e.g. "0 3 * * *"
  tierDowngrade?: string;  // e.g. "0 4 * * 0"
  reindex?: string;        // e.g. "0 5 * * 1"
}

export const DEFAULT_CRON_CONFIG: CronConfig = {
  enabled: false,
  compact: "0 3 * * *",
  tierDowngrade: "0 4 * * 0",
  reindex: "0 5 * * 1",
};

const activeTasks: cron.ScheduledTask[] = [];

// ============================================================================
// Cron Log Collection (for Web Dashboard)
// ============================================================================

interface CronLogEntry {
  task: string;
  message: string;
  timestamp: string;
  level: "info" | "error";
}

const MAX_LOG_ENTRIES = 500;
const cronLogs: CronLogEntry[] = [];

function log(task: string, msg: string, level: "info" | "error" = "info") {
  const timestamp = new Date().toISOString();
  console.error(`[cron:${task}] ${timestamp} ${msg}`);
  cronLogs.push({ task, message: msg, timestamp, level });
  // Keep bounded
  if (cronLogs.length > MAX_LOG_ENTRIES) {
    cronLogs.splice(0, cronLogs.length - MAX_LOG_ENTRIES);
  }
}

/**
 * Get recent cron execution logs (newest first).
 */
export function getCronLogs(limit = 50): CronLogEntry[] {
  return cronLogs.slice(-limit).reverse();
}

/**
 * Compact — find and archive duplicate memories by text similarity
 */
async function runCompact(core: MemoryCore) {
  log("compact", "Starting...");
  try {
    const all = await core.store.list(undefined, undefined, 2000, 0);
    const seen = new Map<string, string>();
    let archived = 0;

    for (const mem of all) {
      // Skip already archived
      try {
        const meta = JSON.parse(mem.metadata || "{}");
        if (meta.archived) continue;
      } catch { /* ignore parse errors */ }

      const key = mem.text.trim().toLowerCase().substring(0, 200);
      if (seen.has(key)) {
        // Mark as archived via metadata
        const existingMeta = JSON.parse(mem.metadata || "{}");
        existingMeta.archived = true;
        await core.store.update(mem.id, { metadata: JSON.stringify(existingMeta) });
        archived++;
      } else {
        seen.set(key, mem.id);
      }
    }

    log("compact", `Done. Scanned ${all.length}, archived ${archived} duplicates.`);
  } catch (e) {
    log("compact", `Error: ${(e as Error).message}`, "error");
  }
}

/**
 * Tier downgrade — archive peripheral memories older than threshold
 */
async function runTierDowngrade(core: MemoryCore) {
  log("tierDowngrade", "Starting...");
  try {
    const all = await core.store.list(undefined, undefined, 2000, 0);
    const now = Date.now();
    const maxAgeMs = 45 * 24 * 60 * 60 * 1000; // 45 days
    let archived = 0;

    for (const mem of all) {
      let meta: Record<string, unknown>;
      try { meta = JSON.parse(mem.metadata || "{}"); } catch { meta = {}; }
      if (meta.archived) continue;

      const tier = (meta.tier as string) || "working";
      if (tier !== "peripheral") continue;

      const lastAccess = (meta.lastAccessedAt as number) || mem.timestamp || 0;
      if (now - lastAccess > maxAgeMs) {
        meta.archived = true;
        await core.store.update(mem.id, { metadata: JSON.stringify(meta) });
        archived++;
      }
    }

    log("tierDowngrade", `Done. Archived ${archived} stale peripheral memories.`);
  } catch (e) {
    log("tierDowngrade", `Error: ${(e as Error).message}`, "error");
  }
}

/**
 * Reindex — rebuild FTS index
 */
async function runReindex(core: MemoryCore) {
  log("reindex", "Starting...");
  try {
    const result = await core.store.rebuildFtsIndex();
    log("reindex", `Done. Success: ${result.success}${result.error ? ` Error: ${result.error}` : ""}`);
  } catch (e) {
    log("reindex", `Error: ${(e as Error).message}`, "error");
  }
}

/**
 * Start all configured cron tasks.
 */
export function startScheduler(core: MemoryCore, config: CronConfig) {
  if (!config.enabled) {
    console.error("[cron] Scheduler disabled (set cron.enabled=true to activate).");
    return;
  }

  const tasks: [string, string | undefined, (core: MemoryCore) => Promise<void>][] = [
    ["compact", config.compact, runCompact],
    ["tierDowngrade", config.tierDowngrade, runTierDowngrade],
    ["reindex", config.reindex, runReindex],
  ];

  for (const [name, schedule, fn] of tasks) {
    if (!schedule) continue;

    if (!cron.validate(schedule)) {
      console.error(`[cron] Invalid schedule for "${name}": "${schedule}" — skipped.`);
      continue;
    }

    const task = cron.schedule(
      schedule,
      () => { fn(core).catch(e => log(name, `Unhandled: ${e}`)); },
      { timezone: "Asia/Shanghai" },
    );
    activeTasks.push(task);
    console.error(`[cron] Scheduled "${name}" → ${schedule}`);
  }

  console.error(`[cron] Scheduler started with ${activeTasks.length} task(s).`);
}

/**
 * Stop all cron tasks.
 */
export function stopScheduler() {
  for (const task of activeTasks) {
    task.stop();
  }
  activeTasks.length = 0;
  console.error("[cron] Scheduler stopped.");
}
