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
