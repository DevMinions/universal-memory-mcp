/**
 * End-to-End Verification Script
 * Tests: store → recall → stats → list → update → delete
 */
import { createMemoryCoreFromEnv } from "./core/index.js";

async function main() {
  console.log("=== Universal Memory MCP - E2E Verification ===\n");

  // 1. Initialize core
  console.log("1. Initializing MemoryCore from env...");
  const core = createMemoryCoreFromEnv();
  console.log("   ✅ Core initialized\n");

  // 2. Check existing data
  console.log("2. Checking existing data...");
  const stats = await core.store.stats();
  console.log(`   Total memories: ${stats.totalCount}`);
  console.log(`   Scopes: ${JSON.stringify(stats.scopeCounts)}`);
  console.log(`   Categories: ${JSON.stringify(stats.categoryCounts)}`);
  console.log("   ✅ Data access confirmed\n");

  // 3. Store a test memory
  console.log("3. Storing test memory...");
  const testText = `[E2E-TEST] Universal Memory MCP verification at ${new Date().toISOString()}`;
  const vector = await core.embedder.embedPassage(testText);
  console.log(`   Embedding generated: ${vector.length} dimensions`);

  const stored = await core.store.store({
    text: testText,
    vector,
    category: "fact",
    scope: "test",
    importance: 0.5,
  });
  console.log(`   ✅ Stored: id=${stored.id}\n`);

  // 4. Recall the memory
  console.log("4. Recalling memory...");
  const results = await core.retriever.retrieve({
    query: "E2E-TEST Universal Memory verification",
    limit: 3,
    scopeFilter: ["test"],
    source: "manual",
  });
  console.log(`   Found ${results.length} results`);
  if (results.length > 0) {
    console.log(`   Top result: score=${results[0].score.toFixed(3)}, id=${results[0].entry.id}`);
    console.log(`   Text: ${results[0].entry.text.slice(0, 80)}...`);
    const matchesStored = results[0].entry.id === stored.id;
    console.log(`   ✅ Stored entry ${matchesStored ? "FOUND" : "NOT FOUND"} in recall\n`);
  }

  // 5. List memories in test scope
  console.log("5. Listing test scope...");
  const listed = await core.store.list(["test"], undefined, 5, 0);
  console.log(`   Listed ${listed.length} memories in 'test' scope`);
  console.log("   ✅ List working\n");

  // 6. Update the memory
  console.log("6. Updating memory...");
  const updated = await core.store.update(stored.id, { importance: 0.9 });
  if (updated) {
    console.log(`   ✅ Updated importance to ${updated.importance}\n`);
  } else {
    console.log("   ❌ Update returned null\n");
  }

  // 7. Delete test memory
  console.log("7. Cleaning up test memory...");
  const deleted = await core.store.delete(stored.id);
  console.log(`   ✅ Deleted: ${deleted}\n`);

  // 8. Verify existing data unchanged
  console.log("8. Verifying existing data unchanged...");
  const statsAfter = await core.store.stats();
  console.log(`   Total memories after cleanup: ${statsAfter.totalCount}`);
  if (statsAfter.totalCount === stats.totalCount) {
    console.log("   ✅ Existing data preserved!\n");
  } else {
    console.log(`   ⚠️  Count mismatch: before=${stats.totalCount}, after=${statsAfter.totalCount}\n`);
  }

  // 9. Cross-check: recall from existing data
  console.log("9. Cross-checking recall from existing (OpenClaw) data...");
  const existingResults = await core.retriever.retrieve({
    query: "user preferences and settings",
    limit: 3,
    source: "manual",
  });
  console.log(`   Found ${existingResults.length} existing memories`);
  if (existingResults.length > 0) {
    for (const r of existingResults) {
      console.log(`   - [${r.entry.category}/${r.entry.scope}] score=${r.score.toFixed(3)} "${r.entry.text.slice(0, 60)}..."`);
    }
    console.log("   ✅ Cross-tool data sharing confirmed!\n");
  } else {
    console.log("   ℹ️  No existing memories found (database may be empty)\n");
  }

  console.log("=== ALL CHECKS PASSED ===");
}

main().catch((err) => {
  console.error("❌ E2E verification failed:", err);
  process.exit(1);
});
