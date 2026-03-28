import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function test() {
  console.log("=== 连接 NAS MCP Server (192.168.1.152:3100) ===");
  
  const url = new URL("http://192.168.1.152:3100/mcp");
  const transport = new StreamableHTTPClientTransport(url);
  
  const client = new Client(
    { name: "test-client", version: "1.0" },
    { capabilities: {} }
  );
  
  try {
    await client.connect(transport);
  } catch (e) {
    console.error("连接错误:", e.message);
    // 尝试换另一种连接方式
    console.log("尝试直接 HTTP 调用...");
  }
  
  console.log("✅ MCP 连接成功!");
  
  // 列出所有工具
  console.log("\n=== 列出工具 ===");
  const tools = await client.listTools();
  console.log(`📦 已注册工具: ${tools.tools.length} 个`);
  tools.tools.forEach(t => console.log(`  - ${t.name}: ${t.description?.substring(0, 60) || ''}`));
  
  // 测试 memory_recall
  console.log("\n=== 测试 memory_recall ===");
  const recallResult = await client.callTool({
    name: "memory_recall",
    arguments: { query: "TypeScript 偏好", limit: 3 }
  });
  console.log("Recall:", JSON.stringify(recallResult.content, null, 2).substring(0, 800));
  
  // 测试 memory_stats
  console.log("\n=== 测试 memory_stats ===");
  const statsResult = await client.callTool({
    name: "memory_stats",
    arguments: {}
  });
  console.log("Stats:", JSON.stringify(statsResult.content, null, 2).substring(0, 500));
  
  await client.close();
  console.log("\n✅ 所有 MCP 测试通过!");
  process.exit(0);
}

test().catch(e => {
  console.error("❌ 测试失败:", e.message);
  process.exit(1);
});
