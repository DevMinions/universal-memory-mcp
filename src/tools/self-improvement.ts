/**
 * Self-Improvement Tools
 *
 * - self_improvement_log: Record a learning or error entry
 * - self_improvement_review: Review improvement history
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";
import {
  appendSelfImprovementEntry,
  ensureSelfImprovementLearningFiles,
} from "../core/self-improvement-files.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function registerSelfImprovementTools(server: McpServer, core: MemoryCore) {
  // --- self_improvement_log ---
  server.tool(
    "self_improvement_log",
    "Record a learning or error entry to the self-improvement log. " +
      "Use type='learning' for corrections/best practices, type='error' for failures.",
    {
      type: z
        .enum(["learning", "error"])
        .describe("Type of entry: learning or error"),
      summary: z.string().describe("Short summary of the learning/error"),
      details: z.string().optional().describe("Detailed description"),
      suggested_action: z.string().optional().describe("Suggested corrective action"),
      category: z
        .string()
        .optional()
        .default("best_practice")
        .describe("Category (e.g. best_practice, bug, config)"),
      area: z
        .string()
        .optional()
        .default("general")
        .describe("Area (e.g. config, code, deployment)"),
      priority: z
        .enum(["low", "medium", "high", "critical"])
        .optional()
        .default("medium")
        .describe("Priority level"),
    },
    async ({ type, summary, details, suggested_action, category, area, priority }) => {
      const baseDir = core.store.dbPath;

      const result = await appendSelfImprovementEntry({
        baseDir,
        type,
        summary,
        details,
        suggestedAction: suggested_action,
        category,
        area,
        priority,
        source: "universal-memory-mcp/self_improvement_log",
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              id: result.id,
              filePath: result.filePath,
              message: `Logged ${type} entry: ${result.id}`,
            }),
          },
        ],
      };
    },
  );

  // --- self_improvement_review ---
  server.tool(
    "self_improvement_review",
    "Review the self-improvement log. Returns recent learnings and errors.",
    {
      type: z
        .enum(["learning", "error", "all"])
        .optional()
        .default("all")
        .describe("Type of entries to review"),
      max_lines: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum lines to return"),
    },
    async ({ type, max_lines }) => {
      const baseDir = core.store.dbPath;
      await ensureSelfImprovementLearningFiles(baseDir);
      const learningsDir = join(baseDir, ".learnings");

      const results: string[] = [];

      if (type === "all" || type === "learning") {
        try {
          const content = await readFile(join(learningsDir, "LEARNINGS.md"), "utf-8");
          const lines = content.split("\n").slice(0, max_lines);
          results.push("=== LEARNINGS ===\n" + lines.join("\n"));
        } catch {
          results.push("=== LEARNINGS === (empty)");
        }
      }

      if (type === "all" || type === "error") {
        try {
          const content = await readFile(join(learningsDir, "ERRORS.md"), "utf-8");
          const lines = content.split("\n").slice(0, max_lines);
          results.push("=== ERRORS ===\n" + lines.join("\n"));
        } catch {
          results.push("=== ERRORS === (empty)");
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: results.join("\n\n"),
          },
        ],
      };
    },
  );
}
