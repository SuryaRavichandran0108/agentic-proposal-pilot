/**
 * GENERATED FILE — do not edit.
 *
 * Single-file build of the ingest-sheet Edge Function, for pasting into the
 * Supabase dashboard function editor. The editable sources are index.ts,
 * google.ts, and sync.ts in this directory.
 *
 * Regenerate with: npm run bundle:function
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";

// ---------------------------------------------------------------------------
// sync.ts
// ---------------------------------------------------------------------------

/**
 * Pure sheet-to-card logic: column resolution, row parsing, and diffing
 * against what is already stored. Kept free of I/O so it can be reasoned
 * about (and tested) on its own.
 */

export interface SourceConfig {
  term_header: string;
  definition_header: string;
  id_header: string | null;
}

export interface SheetRecord {
  rowKey: string;
  term: string;
  definition: string;
  hash: string;
}

export interface ExistingCard {
  id: string;
  source_row_key: string | null;
  content_hash: string | null;
  archived_at: string | null;
}

export interface ColumnMap {
  termIndex: number;
  definitionIndex: number;
  idIndex: number | null;
}

/** Headers match loosely: case, surrounding space, and inner runs of space. */
function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveColumns(
  headerRow: string[],
  config: SourceConfig,
): ColumnMap {
  const normalized = headerRow.map(normalizeHeader);
  const findColumn = (header: string) => normalized.indexOf(normalizeHeader(header));

  const termIndex = findColumn(config.term_header);
  const definitionIndex = findColumn(config.definition_header);

  if (termIndex === -1 || definitionIndex === -1) {
    const missing = [
      termIndex === -1 ? `"${config.term_header}"` : null,
      definitionIndex === -1 ? `"${config.definition_header}"` : null,
    ]
      .filter(Boolean)
      .join(" and ");
    const found =
      headerRow.filter(Boolean).map((h) => `"${h}"`).join(", ") || "(empty row)";
    throw new Error(
      `Could not find column ${missing} in the sheet's first row. Found: ${found}.`,
    );
  }

  let idIndex: number | null = null;
  if (config.id_header) {
    const found = findColumn(config.id_header);
    idIndex = found === -1 ? null : found;
  }

  return { termIndex, definitionIndex, idIndex };
}

/** Stable fingerprint of a row's content, used to detect edits. */
export async function hashContent(
  term: string,
  definition: string,
): Promise<string> {
  // A NUL separator keeps "ab" + "c" from colliding with "a" + "bc".
  const data = new TextEncoder().encode(`${term}\u0000${definition}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Turn raw sheet rows into card records.
 *
 * The row key is the ID column when configured (survives reordering and
 * deletion), otherwise the 1-based sheet row number. Rows missing a term or a
 * definition are skipped rather than turned into half-empty cards.
 */
export async function buildRecords(
  rows: string[][],
  columns: ColumnMap,
): Promise<{ records: SheetRecord[]; skipped: number }> {
  const records: SheetRecord[] = [];
  const seenKeys = new Set<string>();
  let skipped = 0;

  // rows[0] is the header, so data starts at index 1 / sheet row 2.
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const term = (row[columns.termIndex] ?? "").trim();
    const definition = (row[columns.definitionIndex] ?? "").trim();

    if (!term || !definition) {
      // Blank spacer rows are normal in hand-maintained sheets; only count a
      // row as skipped if it actually had content we chose not to use.
      if (row.some((cell) => cell)) skipped++;
      continue;
    }

    const explicitId =
      columns.idIndex !== null ? (row[columns.idIndex] ?? "").trim() : "";
    const rowKey = explicitId || `row:${i + 1}`;

    // A duplicated ID would collide on the unique index. Skip the later one
    // instead of failing the whole run.
    if (seenKeys.has(rowKey)) {
      skipped++;
      continue;
    }
    seenKeys.add(rowKey);

    records.push({
      rowKey,
      term,
      definition,
      hash: await hashContent(term, definition),
    });
  }

  return { records, skipped };
}

export interface DiffResult {
  toCreate: SheetRecord[];
  toUpdate: Array<{ id: string; record: SheetRecord }>;
  toRestore: Array<{ id: string; record: SheetRecord }>;
  toArchive: string[];
}

/**
 * Compare sheet state against stored cards.
 *
 *   key in sheet, not in DB          -> create
 *   key in both, hash differs        -> update
 *   key in both, card archived       -> restore (the row came back)
 *   key gone from sheet, card live   -> archive (when enabled)
 */
export function diffRecords(
  records: SheetRecord[],
  existing: ExistingCard[],
  archiveRemoved: boolean,
): DiffResult {
  const byKey = new Map<string, ExistingCard>();
  for (const card of existing) {
    if (card.source_row_key) byKey.set(card.source_row_key, card);
  }

  const result: DiffResult = {
    toCreate: [],
    toUpdate: [],
    toRestore: [],
    toArchive: [],
  };

  const sheetKeys = new Set<string>();

  for (const record of records) {
    sheetKeys.add(record.rowKey);
    const match = byKey.get(record.rowKey);

    if (!match) {
      result.toCreate.push(record);
    } else if (match.archived_at) {
      result.toRestore.push({ id: match.id, record });
    } else if (match.content_hash !== record.hash) {
      result.toUpdate.push({ id: match.id, record });
    }
  }

  if (archiveRemoved) {
    for (const card of existing) {
      if (!card.source_row_key || card.archived_at) continue;
      if (!sheetKeys.has(card.source_row_key)) result.toArchive.push(card.id);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// google.ts
// ---------------------------------------------------------------------------

/**
 * Minimal Google service-account auth + Sheets reader.
 *
 * Signs a JWT with Web Crypto (no third-party JWT dependency), exchanges it
 * for an access token, and reads a value range from the Sheets API. Tokens are
 * cached in module scope for the life of the isolate.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not set. Add the service account key " +
        "JSON as an Edge Function secret.",
    );
  }

  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the whole key file.",
    );
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "Service account JSON is missing client_email or private_key.",
    );
  }
  return parsed;
}

/** Convert a PEM-encoded PKCS#8 private key into a Web Crypto signing key. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Secrets are often stored with literal "\n" rather than real newlines.
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");

  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function fetchAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Reuse a cached token while it has at least a minute of life left.
  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return cachedToken.value;
  }

  const account = loadServiceAccount();
  const key = await importPrivateKey(account.private_key);

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncode(
    JSON.stringify({
      iss: account.client_email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Google token exchange failed (${response.status}): ${await response.text()}`,
    );
  }

  const payload = await response.json();
  cachedToken = {
    value: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600),
  };
  return cachedToken.value;
}

/**
 * Read every populated cell of a sheet tab as a 2D string array.
 * Google trims trailing empty cells, so rows are ragged — callers must
 * index defensively.
 */
export async function readSheetValues(
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][]> {
  const token = await fetchAccessToken();
  const range = encodeURIComponent(sheetName);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 403) {
    throw new Error(
      "Google returned 403. Share the spreadsheet with the service account " +
        "email (Viewer access is enough).",
    );
  }
  if (response.status === 404) {
    throw new Error(
      `Spreadsheet or tab not found: "${spreadsheetId}" / "${sheetName}". ` +
        "Check the ID and that the tab name matches exactly.",
    );
  }
  if (!response.ok) {
    throw new Error(
      `Sheets API error (${response.status}): ${await response.text()}`,
    );
  }

  const payload = await response.json();
  const values: unknown[][] = payload.values ?? [];

  // Normalize every cell to a trimmed string; numbers and dates arrive typed.
  return values.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim())),
  );
}

// ---------------------------------------------------------------------------
// index.ts
// ---------------------------------------------------------------------------

/**
 * ingest-sheet — event-driven Google Sheet -> flashcard ingestion.
 *
 * Called two ways:
 *   1. The Apps Script onChange trigger, authenticating with the source's
 *      shared secret in the `x-livecards-secret` header.
 *   2. The web app's "Sync now" button, authenticating with the signed-in
 *      user's Supabase JWT.
 *
 * Either way the work is the same: read the sheet, diff it against stored
 * cards, and apply only what changed. Safe to call repeatedly.
 */


const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-livecards-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Constant-time-ish comparison so the secret can't be probed byte by byte. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST." }, 405);
  }

  const startedAt = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Supabase environment is not configured." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let source: {
    id: string;
    deck_id: string;
    user_id: string;
    spreadsheet_id: string;
    sheet_name: string;
    term_header: string;
    definition_header: string;
    id_header: string | null;
    webhook_secret: string;
    archive_removed: boolean;
  } | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const { sourceId, spreadsheetId, trigger } = body as {
      sourceId?: string;
      spreadsheetId?: string;
      trigger?: string;
    };

    if (!sourceId && !spreadsheetId) {
      return json({ error: "Provide sourceId or spreadsheetId." }, 400);
    }

    // ---- Resolve the source -------------------------------------------------
    const query = admin.from("sheet_sources").select("*");
    const { data: sources, error: lookupError } = sourceId
      ? await query.eq("id", sourceId).limit(1)
      : await query.eq("spreadsheet_id", spreadsheetId!).limit(1);

    if (lookupError) throw new Error(`Source lookup failed: ${lookupError.message}`);
    if (!sources || sources.length === 0) {
      return json(
        {
          error:
            "No deck is connected to that spreadsheet. Connect it in the app first.",
        },
        404,
      );
    }
    source = sources[0];

    // ---- Authorize ----------------------------------------------------------
    const presentedSecret = req.headers.get("x-livecards-secret");
    let authorized = false;

    if (presentedSecret) {
      authorized = secretsMatch(presentedSecret, source!.webhook_secret);
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace(/^Bearer /i, "");
      if (token) {
        const { data: userData } = await admin.auth.getUser(token);
        authorized = userData?.user?.id === source!.user_id;
      }
    }

    if (!authorized) {
      return json({ error: "Not authorized for this source." }, 401);
    }

    // ---- Read the sheet -----------------------------------------------------
    const rows = await readSheetValues(source!.spreadsheet_id, source!.sheet_name);
    if (rows.length === 0) {
      throw new Error("The sheet tab is empty — expected a header row.");
    }

    const columns = resolveColumns(rows[0], source!);
    const { records, skipped } = await buildRecords(rows, columns);

    // ---- Diff against stored cards -----------------------------------------
    const { data: existingRaw, error: cardsError } = await admin
      .from("cards")
      .select("id, source_row_key, content_hash, archived_at")
      .eq("deck_id", source!.deck_id)
      .eq("origin", "sheet");

    if (cardsError) throw new Error(`Card lookup failed: ${cardsError.message}`);

    const existing = (existingRaw ?? []) as ExistingCard[];
    const plan = diffRecords(records, existing, source!.archive_removed);

    // ---- Apply --------------------------------------------------------------
    if (plan.toCreate.length > 0) {
      const { error } = await admin.from("cards").insert(
        plan.toCreate.map((record) => ({
          deck_id: source!.deck_id,
          user_id: source!.user_id,
          term: record.term,
          definition: record.definition,
          source_row_key: record.rowKey,
          content_hash: record.hash,
          origin: "sheet",
        })),
      );
      if (error) throw new Error(`Insert failed: ${error.message}`);
    }

    for (const { id, record } of [...plan.toUpdate, ...plan.toRestore]) {
      const { error } = await admin
        .from("cards")
        .update({
          term: record.term,
          definition: record.definition,
          content_hash: record.hash,
          archived_at: null,
        })
        .eq("id", id);
      if (error) throw new Error(`Update failed: ${error.message}`);
    }

    if (plan.toArchive.length > 0) {
      const { error } = await admin
        .from("cards")
        .update({ archived_at: new Date().toISOString() })
        .in("id", plan.toArchive);
      if (error) throw new Error(`Archive failed: ${error.message}`);
    }

    await admin
      .from("sheet_sources")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", source!.id);

    const summary = {
      ok: true,
      rowsScanned: records.length,
      created: plan.toCreate.length,
      updated: plan.toUpdate.length + plan.toRestore.length,
      archived: plan.toArchive.length,
      skipped,
    };

    await admin.from("ingest_runs").insert({
      source_id: source!.id,
      deck_id: source!.deck_id,
      status: "success",
      trigger_source: trigger ?? (presentedSecret ? "sheet" : "manual"),
      rows_scanned: summary.rowsScanned,
      cards_created: summary.created,
      cards_updated: summary.updated,
      cards_archived: summary.archived,
      skipped_rows: skipped,
      duration_ms: Date.now() - startedAt,
    });

    return json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("ingest-sheet failed:", message);

    if (source) {
      await admin.from("ingest_runs").insert({
        source_id: source.id,
        deck_id: source.deck_id,
        status: "error",
        error_message: message.slice(0, 1000),
        duration_ms: Date.now() - startedAt,
      });
    }

    return json({ error: message }, 500);
  }
});
