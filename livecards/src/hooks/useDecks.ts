import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Deck } from "@/types";

/** Decks plus a live card count, so the grid can show "42 cards". */
export interface DeckWithCount extends Deck {
  cardCount: number;
}

export function useDecks() {
  return useQuery({
    queryKey: ["decks"],
    queryFn: async (): Promise<DeckWithCount[]> => {
      // The count is an embedded aggregate filtered to live cards, so
      // archived rows don't inflate the number shown on the deck tile.
      const { data, error } = await supabase
        .from("decks")
        .select("*, cards(count)")
        .is("cards.archived_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data ?? []).map((row: Deck & { cards: { count: number }[] }) => ({
        ...row,
        cardCount: row.cards?.[0]?.count ?? 0,
      }));
    },
  });
}

export function useDeck(deckId: string | undefined) {
  return useQuery({
    queryKey: ["deck", deckId],
    enabled: Boolean(deckId),
    queryFn: async (): Promise<Deck> => {
      const { data, error } = await supabase
        .from("decks")
        .select("*")
        .eq("id", deckId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDeck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("You must be signed in.");

      const { data, error } = await supabase
        .from("decks")
        .insert({
          name: input.name.trim(),
          description: input.description?.trim() || null,
          user_id: userData.user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Deck;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["decks"] }),
  });
}

export function useDeleteDeck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deckId: string) => {
      const { error } = await supabase.from("decks").delete().eq("id", deckId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["decks"] }),
  });
}
