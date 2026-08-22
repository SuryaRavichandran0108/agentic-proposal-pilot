/**
 * Tests for the pure sheet-to-card logic in
 * supabase/functions/ingest-sheet/sync.ts.
 *
 * Run with: npm run test:sync
 * (compiles sync.ts to tests/.build, then executes here under Node)
 */
import assert from "node:assert/strict";
import { resolveColumns, buildRecords, diffRecords, hashContent } from "./.build/sync.js";

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

const config = { term_header: "Term", definition_header: "Definition", id_header: null };

console.log("\nresolveColumns");
await test("finds columns regardless of case and spacing", () => {
  const cols = resolveColumns(["  term ", "DEFINITION"], config);
  assert.equal(cols.termIndex, 0);
  assert.equal(cols.definitionIndex, 1);
  assert.equal(cols.idIndex, null);
});

await test("finds columns in any order, ignoring extra columns", () => {
  const cols = resolveColumns(["Notes", "Definition", "Term"], config);
  assert.equal(cols.termIndex, 2);
  assert.equal(cols.definitionIndex, 1);
});

await test("throws a useful error when a header is missing", () => {
  assert.throws(
    () => resolveColumns(["Word", "Meaning"], config),
    /Could not find column "Term" and "Definition".*Word.*Meaning/s,
  );
});

await test("resolves an optional id column when configured", () => {
  const cols = resolveColumns(["ID", "Term", "Definition"], { ...config, id_header: "ID" });
  assert.equal(cols.idIndex, 0);
});

console.log("\nbuildRecords");
const cols = { termIndex: 0, definitionIndex: 1, idIndex: null };

await test("keys rows by sheet row number when there is no id column", async () => {
  const { records } = await buildRecords(
    [["Term", "Definition"], ["mitochondria", "powerhouse"], ["golgi", "packaging"]],
    cols,
  );
  assert.deepEqual(records.map((r) => r.rowKey), ["row:2", "row:3"]);
  assert.equal(records[0].term, "mitochondria");
});

await test("skips half-filled rows but not blank spacer rows", async () => {
  const { records, skipped } = await buildRecords(
    [["Term", "Definition"], ["alpha", "first"], ["beta", ""], ["", ""], ["", "orphan"]],
    cols,
  );
  assert.equal(records.length, 1);
  assert.equal(skipped, 2, "two rows had content but were unusable");
});

await test("tolerates ragged rows (Google trims trailing empty cells)", async () => {
  const { records } = await buildRecords([["Term", "Definition"], ["solo"]], cols);
  assert.equal(records.length, 0);
});

await test("drops duplicate ids rather than colliding on the unique index", async () => {
  const { records, skipped } = await buildRecords(
    [["ID", "Term", "Definition"], ["x1", "a", "1"], ["x1", "b", "2"]],
    { termIndex: 1, definitionIndex: 2, idIndex: 0 },
  );
  assert.equal(records.length, 1);
  assert.equal(skipped, 1);
});

console.log("\nhashContent");
await test("distinguishes field boundaries", async () => {
  assert.notEqual(await hashContent("ab", "c"), await hashContent("a", "bc"));
});
await test("is stable for identical input", async () => {
  assert.equal(await hashContent("a", "b"), await hashContent("a", "b"));
});

console.log("\ndiffRecords");
const rec = async (key, term, def) => ({
  rowKey: key,
  term,
  definition: def,
  hash: await hashContent(term, def),
});

await test("creates cards for rows it has never seen", async () => {
  const plan = diffRecords([await rec("row:2", "a", "1")], [], true);
  assert.equal(plan.toCreate.length, 1);
  assert.equal(plan.toUpdate.length, 0);
});

await test("is idempotent: re-running with no changes does nothing", async () => {
  const r = await rec("row:2", "a", "1");
  const plan = diffRecords([r], [
    { id: "c1", source_row_key: "row:2", content_hash: r.hash, archived_at: null },
  ], true);
  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.toUpdate.length, 0);
  assert.equal(plan.toArchive.length, 0);
});

await test("updates a card when the row's content changed", async () => {
  const plan = diffRecords([await rec("row:2", "a", "changed")], [
    { id: "c1", source_row_key: "row:2", content_hash: "stale", archived_at: null },
  ], true);
  assert.equal(plan.toUpdate.length, 1);
  assert.equal(plan.toUpdate[0].id, "c1");
});

await test("archives cards whose row vanished", async () => {
  const plan = diffRecords([], [
    { id: "c1", source_row_key: "row:2", content_hash: "h", archived_at: null },
  ], true);
  assert.deepEqual(plan.toArchive, ["c1"]);
});

await test("leaves removed rows alone when archiving is disabled", async () => {
  const plan = diffRecords([], [
    { id: "c1", source_row_key: "row:2", content_hash: "h", archived_at: null },
  ], false);
  assert.equal(plan.toArchive.length, 0);
});

await test("restores an archived card when its row comes back", async () => {
  const r = await rec("row:2", "a", "1");
  const plan = diffRecords([r], [
    { id: "c1", source_row_key: "row:2", content_hash: r.hash, archived_at: "2026-01-01T00:00:00Z" },
  ], true);
  assert.equal(plan.toRestore.length, 1);
  assert.equal(plan.toArchive.length, 0);
});

await test("never archives manually added cards", async () => {
  const plan = diffRecords([], [
    { id: "manual", source_row_key: null, content_hash: null, archived_at: null },
  ], true);
  assert.equal(plan.toArchive.length, 0);
});

console.log(`\n${passed} checks passed\n`);
