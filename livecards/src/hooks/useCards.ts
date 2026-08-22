import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Card } from "@/types";

export function cardsKey(deckId: string) {
  return ["cards", deckId] as const;
}

export function useCards(deckId: string | undefined) {
  return useQuery({
    queryKey: cardsKey(deckId ?? ""),
    enabled: Boolean(deckId),
    queryFn: async (): Promise<Card[]> => {
      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .eq("deck_id", deckId!)
        .is("archived_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Subscribe to card changes for a deck and patch the query cache in place.
 *
 * This is what makes a new sheet row show up without a refresh: the Edge
 * Function inserts a row, Postgres replicates it, and the browser receives it
 * over the Realtime socket a moment later.
 */
export function useRealtimeCards(deckId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!deckId) return;

    const channel = supabase
      .channel(`cards:${deckId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cards",
          filter: `deck_id=eq.${deckId}`,
        },
        (payload) => {
          const key = cardsKey(deckId);

          queryClient.setQueryData<Card[]>(key, (current) => {
            const cards = current ?? [];

            if (payload.eventType === "INSERT") {
              const inserted = payload.new as Card;
              if (inserted.archived_at) return cards;
              if (cards.some((card) => card.id === inserted.id)) return cards;
              return [...cards, inserted];
            }

            if (payload.eventType === "UPDATE") {
              const updated = payload.new as Card;
              // An archive arrives as an UPDATE; drop the card from the view.
              if (updated.archived_at) {
                return cards.filter((card) => card.id !== updated.id);
              }
              const exists = cards.some((card) => card.id === updated.id);
              return exists
                ? cards.map((card) => (card.id === updated.id ? updated : card))
                : [...cards, updated];
            }

            if (payload.eventType === "DELETE") {
              const removed = payload.old as Partial<Card>;
              return cards.filter((card) => card.id !== removed.id);
            }

            return cards;
          });

          if (payload.eventType === "INSERT") {
            const inserted = payload.new as Card;
            if (!inserted.archived_at) {
              toast.success("New card", { description: inserted.term });
            }
          }

          // Deck counts live in a separate query.
          queryClient.invalidateQueries({ queryKey: ["decks"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deckId, queryClient]);
}

export function useCreateCard(deckId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { term: string; definition: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("You must be signed in.");

      const { data, error } = await supabase
        .from("cards")
        .insert({
          deck_id: deckId,
          user_id: userData.user.id,
          term: input.term.trim(),
          definition: input.definition.trim(),
          origin: "manual",
        })
        .select()
        .single();

      if (error) throw error;
      return data as Card;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cardsKey(deckId) });
      queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}

export function useUpdateCard(deckId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; term: string; definition: string }) => {
      const { error } = await supabase
        .from("cards")
        .update({ term: input.term.trim(), definition: input.definition.trim() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cardsKey(deckId) }),
  });
}

export function useDeleteCard(deckId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.from("cards").delete().eq("id", cardId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cardsKey(deckId) });
      queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });
}
