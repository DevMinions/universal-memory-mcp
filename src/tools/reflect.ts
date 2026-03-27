/**
 * memory_reflect Tool
 *
 * Store a reflection text as structured reflection entries (event + items).
 * Wraps the reflection-store pipeline as an MCP tool.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MemoryCore } from "../core/index.js";
import { storeReflectionToLanceDB } from "../core/reflection-store.js";

export function registerReflectTool(server: McpServer, core: MemoryCore) {
  server.tool(
    "memory_reflect",
    "Process and store a structured reflection text. " +
      "Extracts invariant rules and derived deltas, stores them as searchable reflection entries. " +
      "Reflection text should follow the standard format with ## Invariants and ## Derived sections.",
    {
      text: z.string().describe("Reflection text to process and store"),
      scope: z
        .string()
        .optional()
        .default("global")
        .describe("Scope for reflection entries"),
      session_key: z
        .string()
        .optional()
        .default("mcp-reflect")
        .describe("Session key for tracking"),
      session_id: z
        .string()
        .optional()
        .default("mcp")
        .describe("Session ID"),
      agent_id: z
        .string()
        .optional()
        .default("main")
        .describe("Agent ID"),
      command: z
        .string()
        .optional()
        .default("reflect")
        .describe("Command that triggered reflection"),
    },
    async ({ text, scope, session_key, session_id, agent_id, command }) => {
      const result = await storeReflectionToLanceDB({
        reflectionText: text,
        sessionKey: session_key,
        sessionId: session_id,
        agentId: agent_id,
        command,
        scope,
        toolErrorSignals: [],
        runAt: Date.now(),
        usedFallback: false,
        embedPassage: async (passage: string) => {
          const vec = await core.embedder.embed(passage);
          return vec ?? [];
        },
        vectorSearch: async (vector, limit, minScore, scopeFilter) => {
          return core.store.vectorSearch(
            vector,
            limit ?? 5,
            minScore ?? 0.1,
            scopeFilter,
          );
        },
        store: async (entry) => {
          return core.store.store(entry);
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: result.stored,
              eventId: result.eventId,
              storedKinds: result.storedKinds,
              invariants: result.slices.invariants.length,
              derived: result.slices.derived.length,
              message: result.stored
                ? `Stored reflection: ${result.storedKinds.length} entries (${result.slices.invariants.length} invariants, ${result.slices.derived.length} derived)`
                : "No reflection content to store",
            }),
          },
        ],
      };
    },
  );
}
