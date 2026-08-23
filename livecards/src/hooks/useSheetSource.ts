import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { INGEST_FUNCTION_URL, supabase } from "@/lib/supabase";
import type { IngestRun, SheetSource, SyncSummary } from "@/types";

/**
 * Accept either a bare spreadsheet ID or a full Google Sheets URL, since
 * pasting the URL from the address bar is what people actually do.
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

export function useSheetSource(deckId: string | undefined) {
  return useQuery({
    queryKey: ["sheet-source", deckId],
    enabled: Boolean(deckId),
    queryFn: async (): Promise<SheetSource | null> => {
      const { data, error } = await supabase
        .from("sheet_sources")
        .select("*")
        .eq("deck_id", deckId!)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });
}

export interface SourceInput {
  spreadsheetId: string;
  sheetName: string;
  termHeader: string;
  definitionHeader: string;
  idHeader: string | null;
  archiveRemoved: boolean;
}

export function useSaveSheetSource(deckId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SourceInput) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("You must be signed in.");

      const payload = {
        deck_id: deckId,
        user_id: userData.user.id,
        spreadsheet_id: extractSpreadsheetId(input.spreadsheetId),
        sheet_name: input.sheetName.trim() || "Sheet1",
        term_header: input.termHeader.trim() || "Front",
        definition_header: input.definitionHeader.trim() || "Back",
        id_header: input.idHeader?.trim() || null,
        archive_removed: input.archiveRemoved,
      };

      // deck_id is unique on sheet_sources, so this is create-or-replace.
      const { data, error } = await supabase
        .from("sheet_sources")
        .upsert(payload, { onConflict: "deck_id" })
        .select()
        .single();

      if (error) throw error;
      return data as SheetSource;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["sheet-source", deckId] }),
  });
}

export function useDisconnectSheetSource(deckId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sourceId: string) => {
      const { error } = await supabase
        .from("sheet_sources")
        .delete()
        .eq("id", sourceId);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["sheet-source", deckId] }),
  });
}

/**
 * Fire the same Edge Function the sheet trigger calls, authenticating as the
 * signed-in user instead of with the shared secret.
 */
export function useManualSync(deckId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sourceId: string): Promise<SyncSummary> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("You must be signed in.");

      const response = await fetch(INGEST_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sourceId, trigger: "manual" }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Sync failed.");
      return body as SyncSummary;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cards", deckId] });
      queryClient.invalidateQueries({ queryKey: ["sheet-source", deckId] });
      queryClient.invalidateQueries({ queryKey: ["ingest-runs", deckId] });
      queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

export function useIngestRuns(deckId: string | undefined) {
  return useQuery({
    queryKey: ["ingest-runs", deckId],
    enabled: Boolean(deckId),
    queryFn: async (): Promise<IngestRun[]> => {
      const { data, error } = await supabase
        .from("ingest_runs")
        .select("*")
        .eq("deck_id", deckId!)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data ?? [];
    },
  });
}
