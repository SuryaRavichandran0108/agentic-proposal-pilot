# LiveCards

Flashcards that appear the moment you add a row to a Google Sheet.

Add a row to your sheet, and a card shows up in the app a second or two later —
no refresh, no import step, no polling interval.

```
Google Sheet
    |  Apps Script onChange trigger fires on add/edit
    v
POST /functions/v1/ingest-sheet          (Supabase Edge Function)
    |  reads the sheet via the Sheets API
    |  diffs it against stored cards
    v
Postgres  --Realtime-->  browser updates in place
```

The trigger carries no data about *what* changed. It only says "this sheet
changed"; the backend re-reads the sheet and works out the difference itself.
That makes a missed trigger, a duplicate trigger, and a manual sync all
equivalent — the ingestion is idempotent, so running it twice changes nothing.

## What's here

| Path | What it does |
| --- | --- |
| `apps-script/Code.gs` | Sheet-side `onChange` trigger. Paste into Apps Script, run `installTrigger()` once. |
| `supabase/functions/ingest-sheet/` | The webhook: Google auth, sheet reading, diffing, writing. |
| `supabase/functions/ingest-sheet/sync.ts` | Pure column-resolution and diff logic. No I/O, so it's directly testable. |
| `supabase/migrations/0001_init.sql` | Schema, RLS policies, Realtime publication. |
| `src/` | Vite + React + Tailwind front end. |
| `tests/sync.test.mjs` | Tests for the diff logic — `npm run test:sync`. |

## Setup

### 1. Supabase project

Create a project, then apply the schema:

```sh
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste `supabase/migrations/0001_init.sql` into the SQL editor.

### 2. Google service account

The Edge Function reads your sheet as a service account, so no user OAuth flow
is involved.

1. In the [Google Cloud console](https://console.cloud.google.com), create (or
   pick) a project.
2. Enable the **Google Sheets API**.
3. **IAM & Admin > Service Accounts > Create service account.**
4. On the new account, **Keys > Add key > Create new key > JSON**. Download it.
5. Open your spreadsheet and **share it with the service account's email**
   (the `client_email` in that JSON). Viewer access is enough.

Step 5 is the one that's easy to miss — without it the function gets a 403.

### 3. Deploy the function

```sh
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat path/to/key.json)"
supabase functions deploy ingest-sheet
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

The function sets `verify_jwt = false` (see `supabase/config.toml`) because
Apps Script can't present a Supabase JWT. It authenticates callers itself: the
sheet uses a per-deck shared secret, the app uses your signed-in user token.

### 4. Run the app

```sh
cp .env.example .env      # fill in your project URL and anon key
npm install
npm run dev
```

Sign up, create a deck, and open it.

### 5. Connect the sheet

Give your sheet a header row — by default `Term` and `Definition`, in any
order, alongside any other columns you want:

| Term | Definition |
| --- | --- |
| mitochondria | The powerhouse of the cell |
| golgi apparatus | Packages proteins for transport |

In the deck's **Google Sheet source** panel, paste the spreadsheet URL and save.
The panel then shows a `WEBHOOK_URL` and a `WEBHOOK_SECRET`.

In the sheet: **Extensions > Apps Script**, paste in `apps-script/Code.gs`, fill
in those two values at the top, then run `installTrigger()` once and accept the
authorization prompt.

Add a row. The card should appear within a second or two.

## How rows map to cards

Each row becomes one card, identified by a **row key** so re-reading the sheet
updates rather than duplicates:

- **With an ID column** (configure its header in the panel), the key is that
  value. It survives reordering, sorting, and deleting rows above it.
- **Without one**, the key is the sheet row number. Simpler, but inserting a row
  in the middle shifts every key below it, and the next sync will rewrite those
  cards. If you sort or reorder often, add an ID column.

Content changes are detected with a SHA-256 hash of the row, so an unchanged
sheet costs one read and zero writes.

Rows that vanish from the sheet get their cards **archived**, not deleted —
they're hidden from the deck but recoverable, and if the row comes back the card
is restored. Turn this off per source with `archive_removed`.

Cards you add by hand in the app are marked `origin = 'manual'` and are never
touched by a sync.

## Design notes

**Why not poll?** The `onChange` trigger fires on the event that matters —
content changing — instead of on a timer. There's no interval to tune, and no
requests when nothing is happening. Google offers no "sheet was viewed" hook,
and you wouldn't want one: opening the sheet doesn't change the cards.

**Why no LLM?** With `Term` and `Definition` columns, mapping is deterministic:
your text goes in verbatim, there's nothing to hallucinate, and it costs
nothing. If you ever want to ingest freeform prose instead, the seam to add it
is `buildRecords()` in `sync.ts` — everything downstream works on
`{ rowKey, term, definition, hash }` and doesn't care where those came from.

**Why archive instead of delete?** Deleting a row in a spreadsheet is one
keystroke and easy to do by accident. Archiving makes it recoverable.

## Tests

```sh
npm run test:sync   # diff logic: dedupe, updates, archive/restore, edge cases
npx tsc -b          # typecheck
npm run build       # production build
```

## Limits worth knowing

- **Apps Script quotas.** `UrlFetchApp` allows 20,000 calls/day on a consumer
  account. The script debounces to one call per 3 seconds, so ordinary editing
  stays far below that.
- **Sheet size.** Every trigger re-reads the whole tab. That's fine into the
  thousands of rows; past that, switch the row key to an ID column and read an
  incremental range instead.
- **The secret is a bearer token.** Anyone holding a deck's `WEBHOOK_SECRET` can
  make the backend re-read that sheet. It can't read or write anything else.
