import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";
import { createBackup, restoreBackup, listBackups, type BackupConfig } from "../backup/backup-manager.js";

export function registerBackupTool(server: McpServer, core: MemoryCore, dbPath: string, backupConfig: BackupConfig) {
  server.tool(
    "memory_backup",
    "Create a full backup of the memory database, or list/restore existing backups.",
    {
      action: z.enum(["create", "list", "restore"]).describe("Backup action: create, list, or restore"),
      backupName: z.string().optional().describe("For restore: specific backup name (e.g. '2026-03-28-020000'). Omit to use latest."),
    },
    async ({ action, backupName }) => {
      try {
        if (action === "create") {
          const result = await createBackup(core, dbPath, backupConfig);
          if (!result.success) {
            return { content: [{ type: "text" as const, text: `Backup failed: ${result.error}` }] };
          }
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                status: "backup_created",
                path: result.backupPath,
                memoryCount: result.manifest?.memoryCount,
                sizeBytes: result.manifest?.sizeBytes,
                sizeMB: Math.round((result.manifest?.sizeBytes || 0) / 1024 / 1024 * 10) / 10,
                cleanedOldBackups: result.cleaned,
              }, null, 2),
            }],
          };
        }

        if (action === "list") {
          const backups = listBackups(backupConfig.dir);
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                count: backups.length,
                backups: backups.map(b => ({
                  ...b,
                  sizeMB: Math.round(b.sizeBytes / 1024 / 1024 * 10) / 10,
                })),
              }, null, 2),
            }],
          };
        }

        if (action === "restore") {
          const result = await restoreBackup(dbPath, backupConfig.dir, backupName);
          if (!result.success) {
            return { content: [{ type: "text" as const, text: `Restore failed: ${result.error}` }] };
          }
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                status: "restored",
                from: result.restoredFrom,
                memoryCount: result.memoryCount,
                note: "Server restart required to reload the restored database.",
              }, null, 2),
            }],
          };
        }

        return { content: [{ type: "text" as const, text: "Unknown action" }] };
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }] };
      }
    },
  );
}
