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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.10";
import { readSheetValues } from "./google.ts";
import {
  buildRecords,
  diffRecords,
  resolveColumns,
  type ExistingCard,
} from "./sync.ts";

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
