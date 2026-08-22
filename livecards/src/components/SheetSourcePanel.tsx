import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { INGEST_FUNCTION_URL } from "@/lib/supabase";
import { formatRelativeTime } from "@/lib/utils";
import {
  useDisconnectSheetSource,
  useIngestRuns,
  useManualSync,
  useSaveSheetSource,
  useSheetSource,
} from "@/hooks/useSheetSource";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — select the text and copy manually.");
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" />
        <Button type="button" variant="outline" size="icon" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function SheetSourcePanel({ deckId }: { deckId: string }) {
  const { data: source, isLoading } = useSheetSource(deckId);
  const { data: runs } = useIngestRuns(deckId);
  const saveSource = useSaveSheetSource(deckId);
  const disconnect = useDisconnectSheetSource(deckId);
  const manualSync = useManualSync(deckId);

  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [termHeader, setTermHeader] = useState("Term");
  const [definitionHeader, setDefinitionHeader] = useState("Definition");
  const [idHeader, setIdHeader] = useState("");

  // Populate the form once the saved source loads.
  useEffect(() => {
    if (!source) return;
    setSpreadsheetId(source.spreadsheet_id);
    setSheetName(source.sheet_name);
    setTermHeader(source.term_header);
    setDefinitionHeader(source.definition_header);
    setIdHeader(source.id_header ?? "");
  }, [source]);

  const lastRun = runs?.[0];

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    try {
      await saveSource.mutateAsync({
        spreadsheetId,
        sheetName,
        termHeader,
        definitionHeader,
        idHeader: idHeader || null,
        archiveRemoved: source?.archive_removed ?? true,
      });
      toast.success("Sheet connected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    }
  }

  async function handleSync() {
    if (!source) return;
    try {
      const summary = await manualSync.mutateAsync(source.id);
      toast.success("Sync complete", {
        description:
          `${summary.created} created, ${summary.updated} updated, ` +
          `${summary.archived} archived (${summary.rowsScanned} rows read)`,
      });
    } catch (error) {
      toast.error("Sync failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handleDisconnect() {
    if (!source) return;
    if (!confirm("Disconnect this sheet? Existing cards stay in the deck.")) return;
    try {
      await disconnect.mutateAsync(source.id);
      toast.success("Sheet disconnected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect.");
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" />
              Google Sheet source
            </CardTitle>
            <CardDescription>
              {source
                ? `Last synced ${formatRelativeTime(source.last_synced_at)}`
                : "Point this deck at a sheet with Term and Definition columns."}
            </CardDescription>
          </div>

          {source && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={manualSync.isPending}
              >
                {manualSync.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sync now
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDisconnect}>
                <Link2Off className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="spreadsheet">Spreadsheet URL or ID</Label>
            <Input
              id="spreadsheet"
              value={spreadsheetId}
              onChange={(event) => setSpreadsheetId(event.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tab">Tab name</Label>
              <Input
                id="tab"
                value={sheetName}
                onChange={(event) => setSheetName(event.target.value)}
                placeholder="Sheet1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="id-header">ID column (optional)</Label>
              <Input
                id="id-header"
                value={idHeader}
                onChange={(event) => setIdHeader(event.target.value)}
                placeholder="Leave blank to key on row number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-header">Term column header</Label>
              <Input
                id="term-header"
                value={termHeader}
                onChange={(event) => setTermHeader(event.target.value)}
                placeholder="Term"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="definition-header">Definition column header</Label>
              <Input
                id="definition-header"
                value={definitionHeader}
                onChange={(event) => setDefinitionHeader(event.target.value)}
                placeholder="Definition"
              />
            </div>
          </div>

          <Button type="submit" disabled={saveSource.isPending}>
            {saveSource.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {source ? "Save changes" : "Connect sheet"}
          </Button>
        </form>

        {source && (
          <div className="space-y-4 rounded-lg border bg-muted/40 p-4">
            <div>
              <p className="text-sm font-medium">Apps Script setup</p>
              <p className="text-sm text-muted-foreground">
                Paste <code className="font-mono text-xs">apps-script/Code.gs</code> into
                Extensions &gt; Apps Script on your sheet, fill in these two values, then
                run <code className="font-mono text-xs">installTrigger()</code> once.
              </p>
            </div>

            <CopyField label="WEBHOOK_URL" value={INGEST_FUNCTION_URL} />
            <CopyField label="WEBHOOK_SECRET" value={source.webhook_secret} />

            <p className="text-xs text-muted-foreground">
              The secret authenticates your sheet to the backend. Anyone holding it can
              trigger a re-read of this deck, so keep it in the script only.
            </p>
          </div>
        )}

        {lastRun && (
          <div className="flex items-start gap-2 text-sm">
            {lastRun.status === "success" ? (
              <>
                <Badge variant="secondary">Last run</Badge>
                <span className="text-muted-foreground">
                  {lastRun.cards_created} created, {lastRun.cards_updated} updated,{" "}
                  {lastRun.cards_archived} archived &middot;{" "}
                  {formatRelativeTime(lastRun.created_at)}
                  {lastRun.trigger_source ? ` · via ${lastRun.trigger_source}` : ""}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span className="text-destructive">
                  {lastRun.error_message ?? "Last sync failed."}
                </span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
