import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMemoryCoreFromEnv } from "./core/index.js";
import { registerRecallTool } from "./tools/recall.js";
import { registerStoreTool } from "./tools/store.js";
import { registerDeleteTool } from "./tools/delete.js";

const server = new McpServer({
  name: "universal-memory",
  version: "0.1.0",
});

// Initialize core
const core = createMemoryCoreFromEnv();

// Register tools
registerRecallTool(server, core);
registerStoreTool(server, core);
registerDeleteTool(server, core);

// Ping tool for connectivity testing
server.tool("memory_ping", "Test connectivity to Universal Memory MCP Server", {}, async () => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({
        status: "ok",
        server: "universal-memory-mcp",
        version: "0.1.0",
        timestamp: new Date().toISOString(),
      }),
    },
  ],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Universal Memory MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
