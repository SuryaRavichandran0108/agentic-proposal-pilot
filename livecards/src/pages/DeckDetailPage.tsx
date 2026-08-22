import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { SheetSourcePanel } from "@/components/SheetSourcePanel";
import { useDeck } from "@/hooks/useDecks";
import {
  useCards,
  useCreateCard,
  useDeleteCard,
  useRealtimeCards,
  useUpdateCard,
} from "@/hooks/useCards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Card as CardType } from "@/types";

export function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const { data: deck } = useDeck(deckId);
  const { data: cards, isLoading } = useCards(deckId);

  // Cards inserted by the sheet trigger stream in through this subscription.
  useRealtimeCards(deckId);

  const createCard = useCreateCard(deckId!);
  const updateCard = useUpdateCard(deckId!);
  const deleteCard = useDeleteCard(deckId!);

  const [addOpen, setAddOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [editing, setEditing] = useState<CardType | null>(null);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createCard.mutateAsync({ term, definition });
      setTerm("");
      setDefinition("");
      setAddOpen(false);
      toast.success("Card added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add card.");
    }
  }

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    try {
      await updateCard.mutateAsync({
        id: editing.id,
        term: editing.term,
        definition: editing.definition,
      });
      setEditing(null);
      toast.success("Card updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update card.");
    }
  }

  async function handleDelete(card: CardType) {
    if (!confirm(`Delete "${card.term}"?`)) return;
    try {
      await deleteCard.mutateAsync(card.id);
      toast.success("Card deleted");
      if (card.origin === "sheet") {
        toast.info("Heads up", {
          description:
            "This card came from your sheet. It will come back on the next sync unless you remove the row.",
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete card.");
    }
  }

  return (
    <PageShell>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All decks
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {deck?.name ?? "Deck"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {cards?.length ?? 0} {cards?.length === 1 ? "card" : "cards"}
            {deck?.description ? ` · ${deck.description}` : ""}
          </p>
        </div>

        <div className="flex gap-2">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4" />
                Add card
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAdd} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Add a card</DialogTitle>
                  <DialogDescription>
                    Manually added cards are never touched by sheet syncs.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                  <Label htmlFor="term">Term</Label>
                  <Input
                    id="term"
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="definition">Definition</Label>
                  <Textarea
                    id="definition"
                    value={definition}
                    onChange={(event) => setDefinition(event.target.value)}
                    required
                  />
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={createCard.isPending}>
                    {createCard.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Add card
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* `disabled` on an anchor is inert, so swap the element instead. */}
          {!cards || cards.length === 0 ? (
            <Button disabled>
              <Play className="h-4 w-4" />
              Study
            </Button>
          ) : (
            <Button asChild>
              <Link to={`/deck/${deckId}/study`}>
                <Play className="h-4 w-4" />
                Study
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <SheetSourcePanel deckId={deckId!} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !cards || cards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            <p className="font-medium">No cards yet</p>
            <p className="text-sm text-muted-foreground">
              Connect a sheet above, or add a card by hand.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {cards.map((card) => (
            <Card key={card.id} className="group animate-fade-in">
              <CardContent className="flex items-start gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{card.term}</p>
                    {card.origin === "sheet" && (
                      <Badge variant="outline" className="text-[10px]">
                        sheet
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {card.definition}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit card"
                    onClick={() => setEditing(card)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete card"
                    onClick={() => handleDelete(card)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <form onSubmit={handleUpdate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Edit card</DialogTitle>
              <DialogDescription>
                {editing?.origin === "sheet"
                  ? "This card is owned by your sheet — the next sync will overwrite these edits."
                  : "Changes save immediately."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="edit-term">Term</Label>
              <Input
                id="edit-term"
                value={editing?.term ?? ""}
                onChange={(event) =>
                  setEditing((current) =>
                    current ? { ...current, term: event.target.value } : current,
                  )
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-definition">Definition</Label>
              <Textarea
                id="edit-definition"
                value={editing?.definition ?? ""}
                onChange={(event) =>
                  setEditing((current) =>
                    current ? { ...current, definition: event.target.value } : current,
                  )
                }
                required
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={updateCard.isPending}>
                {updateCard.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
