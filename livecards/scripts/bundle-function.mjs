/**
 * Produce a single-file version of the ingest-sheet Edge Function.
 *
 * The Supabase dashboard's function editor takes one file, so this inlines
 * the local modules (sync.ts, google.ts) into index.ts and writes the result
 * to supabase/functions/ingest-sheet/bundled.ts.
 *
 * The modular sources stay the source of truth — this is generated output,
 * regenerated with: npm run bundle:function
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FUNCTION_DIR = "supabase/functions/ingest-sheet";
const OUTPUT = path.join(FUNCTION_DIR, "bundled.ts");

// Order matters for readability only — ES module hoisting makes the remote
// import valid wherever it appears.
const MODULES = ["sync.ts", "google.ts"];
const ENTRY = "index.ts";

/** Strip relative imports; those symbols are about to be in the same file. */
function stripLocalImports(source) {
  // [^{}] cannot cross into the next import's brace, so this can never
  // swallow a following statement the way [\s\S]*? would.
  return source.replace(
    /^import\s+(?:type\s+)?\{[^{}]*\}\s+from\s+"\.\/[^"]+";\n/gm,
    "",
  );
}

/** Pull the remote (URL) imports out so they can be hoisted to the top. */
function extractRemoteImports(source) {
  const imports = [];
  const body = source.replace(
    /^import\s+[^;]*?from\s+"(https?:\/\/[^"]+)";\n/gm,
    (match) => {
      imports.push(match.trim());
      return "";
    },
  );
  return { imports, body };
}

const banner = `/**
 * GENERATED FILE — do not edit.
 *
 * Single-file build of the ingest-sheet Edge Function, for pasting into the
 * Supabase dashboard function editor. The editable sources are index.ts,
 * google.ts, and sync.ts in this directory.
 *
 * Regenerate with: npm run bundle:function
 */
`;

const parts = [];
const remoteImports = new Set();

for (const file of [...MODULES, ENTRY]) {
  const source = await readFile(path.join(FUNCTION_DIR, file), "utf8");
  const { imports, body } = extractRemoteImports(stripLocalImports(source));
  for (const line of imports) remoteImports.add(line);
  parts.push(`// ---------------------------------------------------------------------------
// ${file}
// ---------------------------------------------------------------------------

${body.trim()}`);
}

const output = [
  banner,
  [...remoteImports].join("\n"),
  "",
  parts.join("\n\n"),
  "",
].join("\n");

await writeFile(OUTPUT, output, "utf8");

// Fail loudly here rather than at deploy time. A leftover relative import
// means the strip regex missed something; a dropped remote import means it
// matched too much and swallowed one.
if (/from\s+"\.\//.test(output)) {
  console.error("ERROR: bundle still contains a relative import.");
  process.exit(1);
}

for (const line of remoteImports) {
  if (!output.includes(line)) {
    console.error(`ERROR: remote import was dropped from the bundle:\n  ${line}`);
    process.exit(1);
  }
}

if (remoteImports.size === 0) {
  console.error("ERROR: no remote imports found — expected at least supabase-js.");
  process.exit(1);
}

console.log(`wrote ${OUTPUT} (${output.split("\n").length} lines)`);
