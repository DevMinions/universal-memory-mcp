/**
 * memory_extract Tool
 *
 * Extract memories from conversation text using LLM-powered analysis.
 * Wraps the SmartExtractor pipeline as an MCP tool.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";
import { SmartExtractor } from "../core/smart-extractor.js";

export function registerExtractTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_extract",
    "Extract and persist memories from a conversation text using LLM-powered analysis. " +
      "Analyzes text for profile facts, preferences, entities, events, cases, and patterns. " +
      "Requires LLM_API_KEY to be configured.",
    {
      text: z.string().describe("Conversation or text to extract memories from"),
      scope: z
        .string()
        .optional()
        .default("global")
        .describe("Scope for extracted memories (default: global)"),
      session_key: z
        .string()
        .optional()
        .default("mcp-extract")
        .describe("Session identifier for tracking extraction source"),
    },
    async ({ text, scope, session_key }) => {
      if (!core.llmClient) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "LLM client not configured",
                hint: "Set LLM_API_KEY environment variable to enable memory extraction",
              }),
            },
          ],
          isError: true,
        };
      }

      const extractor = new SmartExtractor(
        core.store,
        core.embedder,
        core.llmClient,
        {
          defaultScope: scope,
          log: (msg) => console.error(msg),
          debugLog: (msg) => console.error(msg),
        },
      );

      const stats = await extractor.extractAndPersist(text, session_key, {
        scope,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              stats,
              message: `Extracted: ${stats.created} created, ${stats.merged} merged, ${stats.skipped} skipped`,
            }),
          },
        ],
      };
    },
  );
}
