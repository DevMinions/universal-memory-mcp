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

  // --- self_improvement_extract_skill ---
  server.tool(
    "self_improvement_extract_skill",
    "Create skill scaffold from a learning entry. Extracts entry from LEARNINGS.md/ERRORS.md and returns a skill template.",
    {
      learningId: z.string().describe("Entry ID format: LRN-YYYYMMDD-001 or ERR-YYYYMMDD-001"),
      skillName: z.string().describe("Skill name (lowercase with hyphens, e.g. 'fix-timeout-error')"),
      sourceFile: z
        .enum(["LEARNINGS.md", "ERRORS.md"])
        .optional()
        .default("LEARNINGS.md")
        .describe("Source file"),
      outputDir: z.string().optional().default("skills").describe("Relative output directory"),
    },
    async ({ learningId, skillName, sourceFile, outputDir }) => {
      try {
        const baseDir = core.store.dbPath;
        const learningsDir = join(baseDir, ".learnings");
        const filePath = join(learningsDir, sourceFile);

        let content: string;
        try {
          content = await readFile(filePath, "utf-8");
        } catch {
          return {
            content: [{ type: "text" as const, text: `File not found: ${sourceFile}` }],
            isError: true,
          };
        }

        // Find the entry by ID
        const lines = content.split("\n");
        let entryLines: string[] = [];
        let found = false;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(learningId)) {
            found = true;
            // Capture until next entry or EOF
            for (let j = i; j < lines.length; j++) {
              if (j > i && /^### (LRN|ERR)-\d{8}-\d{3}/.test(lines[j])) break;
              entryLines.push(lines[j]);
            }
            break;
          }
        }

        if (!found) {
          return {
            content: [{ type: "text" as const, text: `Entry not found: ${learningId} in ${sourceFile}` }],
            isError: true,
          };
        }

        const entryText = entryLines.join("\n").trim();

        // Generate skill scaffold
        const scaffold = {
          skillPath: `${outputDir}/${skillName}/SKILL.md`,
          content: [
            "---",
            `name: ${skillName}`,
            `description: Skill extracted from ${learningId}`,
            "---",
            "",
            `# ${skillName}`,
            "",
            `> Auto-generated from ${sourceFile} entry ${learningId}`,
            "",
            "## Context",
            "",
            entryText,
            "",
            "## Steps",
            "",
            "1. TODO: Define specific steps",
            "2. TODO: Add verification criteria",
            "",
            "## References",
            "",
            `- Source: ${sourceFile} → ${learningId}`,
          ].join("\n"),
        };

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: "skill_scaffold_generated",
              learningId,
              skillName,
              suggestedPath: scaffold.skillPath,
              scaffold: scaffold.content,
              note: "Copy the scaffold content to create the skill file.",
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Extract skill failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    },
  );
}
