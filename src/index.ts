import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "universal-memory",
  version: "0.1.0",
});

// Ping tool for connectivity testing
server.tool("memory_ping", "Test connectivity to Universal Memory MCP Server", {}, async () => {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          status: "ok",
          server: "universal-memory-mcp",
          version: "0.1.0",
          timestamp: new Date().toISOString(),
        }),
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Universal Memory MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
