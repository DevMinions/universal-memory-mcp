import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { createMemoryCoreFromEnv } from "./core/index.js";
import { loadConfig } from "./core/config-loader.js";
import { startScheduler, stopScheduler, type CronConfig, DEFAULT_CRON_CONFIG } from "./cron/scheduler.js";
import { DEFAULT_BACKUP_CONFIG, type BackupConfig } from "./backup/backup-manager.js";
import { handleApiRequest } from "./web/api.js";
import { serveDashboard } from "./web/static-server.js";
import { registerRecallTool } from "./tools/recall.js";
import { registerStoreTool } from "./tools/store.js";
import { registerDeleteTool } from "./tools/delete.js";
import { registerStatsTool } from "./tools/stats.js";
import { registerListTool } from "./tools/list.js";
import { registerUpdateTool } from "./tools/update.js";
import { registerForgetTool } from "./tools/forget.js";
import { registerReindexTool } from "./tools/reindex.js";
import { registerExportTool } from "./tools/export.js";
import { registerExtractTool } from "./tools/extract.js";
import { registerArchiveTool } from "./tools/archive.js";
import { registerPromoteTool } from "./tools/promote.js";
import { registerReflectTool } from "./tools/reflect.js";
import { registerCompactTool } from "./tools/compact.js";
import { registerExplainRankTool } from "./tools/explain-rank.js";
import { registerSelfImprovementTools } from "./tools/self-improvement.js";
import { registerBackupTool } from "./tools/backup.js";
import { registerImportTool } from "./tools/import.js";

const TOOL_COUNT = 20;

import type { MemoryCore } from "./core/index.js";

function createMcpServer(sharedCore?: MemoryCore, extraCtx?: { dbPath: string; backupConfig: BackupConfig }): { server: McpServer; core: MemoryCore } {
  const server = new McpServer({
    name: "universal-memory",
    version: "0.5.0",
  });

  // Use shared core or create new (stdio mode)
  const core = sharedCore ?? createMemoryCoreFromEnv();

  // Register all tools
  registerRecallTool(server, core);
  registerStoreTool(server, core);
  registerDeleteTool(server, core);
  registerUpdateTool(server, core);
  registerForgetTool(server, core);
  registerStatsTool(server, core);
  registerListTool(server, core);
  registerReindexTool(server, core);
  registerExportTool(server, core);
  registerExtractTool(server, core);
  registerArchiveTool(server, core);
  registerPromoteTool(server, core);
  registerReflectTool(server, core);
  registerCompactTool(server, core);
  registerExplainRankTool(server, core);
  registerSelfImprovementTools(server, core);
  registerImportTool(server, core);

  // Backup tool (needs dbPath + config)
  if (extraCtx) {
    registerBackupTool(server, core, extraCtx.dbPath, extraCtx.backupConfig);
  }

  // Ping tool for connectivity testing
  server.tool("memory_ping", "Test connectivity to Universal Memory MCP Server", {}, async () => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          status: "ok",
          server: "universal-memory-mcp",
          version: "0.5.0",
          tools: TOOL_COUNT,
          mode: process.env.MCP_MODE || "stdio",
          timestamp: new Date().toISOString(),
        }),
      },
    ],
  }));

  return { server, core };
}

// ============================================================================
// stdio mode — local process communication (default)
// ============================================================================

async function runStdio() {
  const { server } = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Universal Memory MCP Server running on stdio (${TOOL_COUNT} tools registered)`);
}

// ============================================================================
// HTTP mode — remote access via Streamable HTTP (SSE + POST)
// ============================================================================

async function runHttp() {
  const host = process.env.MCP_HOST || "0.0.0.0";
  const port = parseInt(process.env.MCP_PORT || "3100", 10);
  const authToken = process.env.MCP_AUTH_TOKEN;

  if (!authToken) {
    console.error("⚠️  WARNING: MCP_AUTH_TOKEN not set — server has NO authentication!");
    console.error("   Set MCP_AUTH_TOKEN for production deployments.");
  }

  // Start cron scheduler if enabled
  const cfg = loadConfig();
  const cronConfig: CronConfig = { ...DEFAULT_CRON_CONFIG, ...(cfg as any).cron };
  const backupConfig: BackupConfig = { ...DEFAULT_BACKUP_CONFIG, ...(cfg as any).backup };

  // Resolve dbPath for backup
  const dbPath = (cfg as any).dbPath
    ? (cfg as any).dbPath.replace(/^~/, homedir())
    : join(homedir(), ".openclaw/memory/lancedb-pro");

  // Create a SINGLE shared MemoryCore for all sessions + Web API
  const sharedCore = createMemoryCoreFromEnv();
  startScheduler(sharedCore, cronConfig, backupConfig);

  // Web Dashboard API context — shares the same core
  const apiCtx = { core: sharedCore };

  // Track active transports by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // CORS headers for cross-origin clients
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, Authorization");
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Web Dashboard — serve at root
    if (serveDashboard(req, res, url)) {
      return;
    }

    // REST API for Web Dashboard
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApiRequest(req, res, url, apiCtx);
      if (handled) return;
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        server: "universal-memory-mcp",
        version: "0.5.0",
        tools: TOOL_COUNT,
        mode: "http",
        activeSessions: transports.size,
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    // Token authentication (skip for health check above)
    if (authToken) {
      const authHeader = req.headers.authorization;
      const providedToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (providedToken !== authToken) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden", message: "Invalid or missing Authorization: Bearer <token>" }));
        return;
      }
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      // Check for existing session
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      
      if (sessionId && transports.has(sessionId)) {
        // Route to existing session transport
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      // New session — create MCP server with SHARED core
      // Allow GET (for SSE) or POST (for Streamable HTTP). Use client's sessionId if provided.
      const newSessionId = sessionId || randomUUID();
      const { server } = createMcpServer(sharedCore, { dbPath, backupConfig });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });

      transports.set(newSessionId, transport);

      transport.onclose = () => {
        if (transports.has(newSessionId)) {
          transports.delete(newSessionId);
          console.error(`[http] Session ${newSessionId.slice(0, 8)} closed (${transports.size} active)`);
        }
      };

      await server.connect(transport);
      console.error(`[http] New session ${newSessionId.slice(0, 8)} (${transports.size} active)`);
      
      await transport.handleRequest(req, res);
        return;
    }

    // 404 for unknown paths
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Not found",
      endpoints: {
        dashboard: "/ (GET: Web Dashboard)",
        api: "/api/* (REST API for dashboard)",
        mcp: "/mcp (POST: JSON-RPC, GET: SSE stream)",
        health: "/health (GET: health check)",
      },
    }));
  });

  httpServer.listen(port, host, () => {
    console.error(`Universal Memory MCP Server v0.5.0 running on http://${host}:${port}`);
    console.error(`📊 Dashboard: http://${host}:${port}/`);
    console.error(`🔌 MCP endpoint: http://${host}:${port}/mcp`);
    console.error(`❤️  Health check: http://${host}:${port}/health`);
    console.error(`Mode: Streamable HTTP (SSE + POST) | ${TOOL_COUNT} tools registered`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.error("\nShutting down...");
    stopScheduler();
    for (const [, t] of transports) t.close();
    transports.clear();
    httpServer.close(() => {
      console.error("Server stopped.");
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ============================================================================
// Entry Point
// ============================================================================

async function main() {
  const mode = process.env.MCP_MODE || process.argv[2] || "stdio";

  switch (mode) {
    case "http":
    case "sse":
    case "remote":
      await runHttp();
      break;
    case "stdio":
    default:
      await runStdio();
      break;
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
