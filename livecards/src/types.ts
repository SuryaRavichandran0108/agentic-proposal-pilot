export interface Deck {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  deck_id: string;
  user_id: string;
  term: string;
  definition: string;
  source_row_key: string | null;
  content_hash: string | null;
  origin: "sheet" | "manual";
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SheetSource {
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
  last_synced_at: string | null;
  created_at: string;
}

export interface IngestRun {
  id: string;
  deck_id: string | null;
  status: "success" | "error";
  trigger_source: string | null;
  rows_scanned: number;
  cards_created: number;
  cards_updated: number;
  cards_archived: number;
  skipped_rows: number;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export interface SyncSummary {
  ok: boolean;
  rowsScanned: number;
  created: number;
  updated: number;
  archived: number;
  skipped: number;
}
