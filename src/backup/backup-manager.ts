/**
 * Backup Manager — 文件级 LanceDB 备份与恢复
 *
 * 备份策略：
 * - 递归复制 LanceDB 数据目录到时间戳子目录
 * - 写入 manifest.json（版本、记忆数、大小、时间）
 * - 保留最近 N 份备份，自动清理旧备份
 * - 维护 latest 软链接指向最新备份
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cpSync } from "node:fs";
import type { MemoryCore } from "../core/index.js";

export interface BackupConfig {
  enabled: boolean;
  dir: string;             // 备份存储目录
  schedule?: string;       // cron 表达式, e.g. "0 2 * * *"
  maxBackups: number;      // 保留最近 N 份
}

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: false,
  dir: "./backups",
  schedule: "0 2 * * *",
  maxBackups: 7,
};

export interface BackupManifest {
  version: string;
  timestamp: string;
  memoryCount: number;
  sizeBytes: number;
  dbPath: string;
  backupDir: string;
}

export interface BackupResult {
  success: boolean;
  backupPath?: string;
  manifest?: BackupManifest;
  error?: string;
  cleaned?: number;       // 清理掉的旧备份数
}

export interface RestoreResult {
  success: boolean;
  restoredFrom?: string;
  memoryCount?: number;
  error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function getDirSizeBytes(dirPath: string): number {
  let size = 0;
  if (!existsSync(dirPath)) return 0;

  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isFile()) {
      size += statSync(fullPath).size;
    } else if (entry.isDirectory()) {
      size += getDirSizeBytes(fullPath);
    }
  }
  return size;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// ============================================================================
// Backup
// ============================================================================

/**
 * Create a full backup of the LanceDB data directory.
 */
export async function createBackup(
  core: MemoryCore,
  dbPath: string,
  config: BackupConfig,
): Promise<BackupResult> {
  try {
    const backupBaseDir = resolve(config.dir);
    const timestamp = formatTimestamp(new Date());
    const backupDir = join(backupBaseDir, timestamp);

    // Ensure backup base directory exists
    mkdirSync(backupBaseDir, { recursive: true });

    // Ensure source DB exists
    if (!existsSync(dbPath)) {
      return { success: false, error: `Source DB path not found: ${dbPath}` };
    }

    // Copy entire LanceDB directory
    mkdirSync(backupDir, { recursive: true });
    cpSync(dbPath, join(backupDir, "lancedb-data"), { recursive: true });

    // Get stats
    const stats = await core.store.stats();
    const sizeBytes = getDirSizeBytes(join(backupDir, "lancedb-data"));

    // Write manifest
    const manifest: BackupManifest = {
      version: "0.3.0",
      timestamp: new Date().toISOString(),
      memoryCount: stats.totalCount,
      sizeBytes,
      dbPath,
      backupDir,
    };

    writeFileSync(
      join(backupDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );

    // Update latest symlink
    const latestLink = join(backupBaseDir, "latest");
    try {
      if (existsSync(latestLink)) unlinkSync(latestLink);
      symlinkSync(backupDir, latestLink);
    } catch {
      // symlink may fail on some systems, non-critical
    }

    // Cleanup old backups
    const cleaned = cleanupOldBackups(backupBaseDir, config.maxBackups);

    return {
      success: true,
      backupPath: backupDir,
      manifest,
      cleaned,
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ============================================================================
// Restore
// ============================================================================

/**
 * Restore LanceDB data from a backup directory.
 * If backupPath is not specified, restores from the latest backup.
 */
export async function restoreBackup(
  dbPath: string,
  backupBaseDir: string,
  backupName?: string,
): Promise<RestoreResult> {
  try {
    const resolvedBaseDir = resolve(backupBaseDir);

    // Determine which backup to restore
    let backupDir: string;
    if (backupName) {
      backupDir = join(resolvedBaseDir, backupName);
    } else {
      // Use latest
      const latestLink = join(resolvedBaseDir, "latest");
      if (existsSync(latestLink)) {
        backupDir = resolve(readFileSync(latestLink, "utf-8").trim() || latestLink);
        // If latest is a symlink, resolve it
        try {
          const realPath = resolve(resolvedBaseDir, readdirSync(resolvedBaseDir)
            .filter(d => d !== "latest" && existsSync(join(resolvedBaseDir, d, "manifest.json")))
            .sort()
            .pop() || "");
          if (existsSync(join(realPath, "manifest.json"))) {
            backupDir = realPath;
          }
        } catch {
          // fall through
        }
      } else {
        // Find the most recent backup by name
        const backups = listBackups(resolvedBaseDir);
        if (backups.length === 0) {
          return { success: false, error: "No backups found" };
        }
        backupDir = join(resolvedBaseDir, backups[0].name);
      }
    }

    // Verify backup exists
    const dataDir = join(backupDir, "lancedb-data");
    const manifestFile = join(backupDir, "manifest.json");
    if (!existsSync(dataDir) || !existsSync(manifestFile)) {
      return { success: false, error: `Invalid backup at: ${backupDir}` };
    }

    // Read manifest
    const manifest: BackupManifest = JSON.parse(readFileSync(manifestFile, "utf-8"));

    // Remove current DB and replace with backup
    if (existsSync(dbPath)) {
      rmSync(dbPath, { recursive: true, force: true });
    }
    cpSync(dataDir, dbPath, { recursive: true });

    return {
      success: true,
      restoredFrom: backupDir,
      memoryCount: manifest.memoryCount,
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// ============================================================================
// List & Cleanup
// ============================================================================

export interface BackupInfo {
  name: string;
  timestamp: string;
  memoryCount: number;
  sizeBytes: number;
}

/**
 * List available backups, sorted newest first.
 */
export function listBackups(backupBaseDir: string): BackupInfo[] {
  const resolvedDir = resolve(backupBaseDir);
  if (!existsSync(resolvedDir)) return [];

  const entries = readdirSync(resolvedDir, { withFileTypes: true });
  const backups: BackupInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "latest") continue;

    const manifestPath = join(resolvedDir, entry.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest: BackupManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      backups.push({
        name: entry.name,
        timestamp: manifest.timestamp,
        memoryCount: manifest.memoryCount,
        sizeBytes: manifest.sizeBytes,
      });
    } catch {
      // Skip invalid manifests
    }
  }

  return backups.sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Remove old backups, keeping only the most recent `maxKeep`.
 */
function cleanupOldBackups(backupBaseDir: string, maxKeep: number): number {
  const all = listBackups(backupBaseDir);
  if (all.length <= maxKeep) return 0;

  const toRemove = all.slice(maxKeep);
  let cleaned = 0;

  for (const backup of toRemove) {
    try {
      rmSync(join(resolve(backupBaseDir), backup.name), { recursive: true, force: true });
      cleaned++;
    } catch {
      // Non-critical
    }
  }

  return cleaned;
}
