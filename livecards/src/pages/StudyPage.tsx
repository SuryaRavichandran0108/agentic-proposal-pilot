import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, RotateCcw, Shuffle } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { useCards, useRealtimeCards } from "@/hooks/useCards";
import { useDeck } from "@/hooks/useDecks";
import { shuffle } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function StudyPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const { data: deck } = useDeck(deckId);
  const { data: cards, isLoading } = useCards(deckId);

  // Keep studying while the sheet keeps feeding the deck.
  useRealtimeCards(deckId);

  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const cardsById = useMemo(() => {
    const map = new Map<string, { term: string; definition: string }>();
    for (const card of cards ?? []) map.set(card.id, card);
    return map;
  }, [cards]);

  // Seed the order once, then append anything that arrives mid-session rather
  // than reshuffling under the user.
  useEffect(() => {
    if (!cards) return;
    setOrder((current) => {
      const known = new Set(current);
      const additions = cards.filter((card) => !known.has(card.id)).map((c) => c.id);
      const stillPresent = current.filter((id) => cardsById.has(id));
      if (current.length === 0) return cards.map((card) => card.id);
      if (additions.length === 0 && stillPresent.length === current.length) return current;
      return [...stillPresent, ...additions];
    });
  }, [cards, cardsById]);

  const total = order.length;
  const currentId = order[index];
  const current = currentId ? cardsById.get(currentId) : undefined;

  const goNext = useCallback(() => {
    setFlipped(false);
    setIndex((i) => (total === 0 ? 0 : (i + 1) % total));
  }, [total]);

  const goPrevious = useCallback(() => {
    setFlipped(false);
    setIndex((i) => (total === 0 ? 0 : (i - 1 + total) % total));
  }, [total]);

  const reshuffle = useCallback(() => {
    setOrder((current) => shuffle(current));
    setIndex(0);
    setFlipped(false);
  }, []);

  const restart = useCallback(() => {
    setIndex(0);
    setFlipped(false);
  }, []);

  // Keyboard: space/enter flips, arrows move.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((f) => !f);
      } else if (event.key === "ArrowRight") {
        goNext();
      } else if (event.key === "ArrowLeft") {
        goPrevious();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrevious]);

  // A deleted or archived card can shrink the deck out from under the index.
  useEffect(() => {
    if (total > 0 && index >= total) setIndex(0);
  }, [index, total]);

  return (
    <PageShell>
      <Link
        to={`/deck/${deckId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {deck?.name ?? "Deck"}
      </Link>

      {isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : total === 0 || !current ? (
        <Card className="border-dashed">
          <CardContent className="py-20 text-center">
            <p className="font-medium">Nothing to study yet</p>
            <p className="text-sm text-muted-foreground">
              Add a row to your sheet and it will show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {index + 1} of {total}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={reshuffle}>
                <Shuffle className="h-4 w-4" />
                Shuffle
              </Button>
              <Button variant="ghost" size="sm" onClick={restart}>
                <RotateCcw className="h-4 w-4" />
                Restart
              </Button>
            </div>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${((index + 1) / total) * 100}%` }}
            />
          </div>

          {/* The flip is a 3D rotation, so both faces are always in the DOM. */}
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? "Show term" : "Show definition"}
            className="perspective block w-full focus:outline-none"
          >
            <div
              className={`preserve-3d relative h-72 w-full transition-transform duration-500 ${
                flipped ? "rotate-y-180" : ""
              }`}
            >
              <Card className="backface-hidden absolute inset-0 flex items-center justify-center p-8 shadow-sm">
                <p className="text-center text-2xl font-medium">{current.term}</p>
              </Card>

              <Card className="backface-hidden rotate-y-180 absolute inset-0 flex items-center justify-center bg-primary p-8 text-primary-foreground shadow-sm">
                <p className="whitespace-pre-wrap text-center text-lg">
                  {current.definition}
                </p>
              </Card>
            </div>
          </button>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={goPrevious}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>

            <p className="text-xs text-muted-foreground">
              Space flips &middot; arrow keys move
            </p>

            <Button onClick={goNext}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
