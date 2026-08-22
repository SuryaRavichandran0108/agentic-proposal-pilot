import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, Sheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { useCreateDeck, useDecks, useDeleteDeck } from "@/hooks/useDecks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function DecksPage() {
  const { data: decks, isLoading } = useDecks();
  const createDeck = useCreateDeck();
  const deleteDeck = useDeleteDeck();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createDeck.mutateAsync({ name, description });
      setName("");
      setDescription("");
      setOpen(false);
      toast.success("Deck created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create deck.");
    }
  }

  async function handleDelete(deckId: string, deckName: string) {
    if (!confirm(`Delete "${deckName}" and all of its cards? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteDeck.mutateAsync(deckId);
      toast.success("Deck deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete deck.");
    }
  }

  return (
    <PageShell>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your decks</h1>
          <p className="text-sm text-muted-foreground">
            Connect a Google Sheet and cards arrive as you type them.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              New deck
            </Button>
          </DialogTrigger>

          <DialogContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <DialogHeader>
                <DialogTitle>New deck</DialogTitle>
                <DialogDescription>
                  You can connect a sheet to it on the next screen.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="deck-name">Name</Label>
                <Input
                  id="deck-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Neuroanatomy"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deck-description">Description (optional)</Label>
                <Textarea
                  id="deck-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Terms from lecture 4 onward"
                />
              </div>

              <DialogFooter>
                <Button type="submit" disabled={createDeck.isPending}>
                  {createDeck.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create deck
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !decks || decks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Sheet className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No decks yet</p>
              <p className="text-sm text-muted-foreground">
                Create one, then point it at a Google Sheet.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map((deck) => (
            <Card key={deck.id} className="group relative transition-shadow hover:shadow-md">
              <Link to={`/deck/${deck.id}`} className="block">
                <CardHeader>
                  <CardTitle className="pr-8">{deck.name}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {deck.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {deck.cardCount} {deck.cardCount === 1 ? "card" : "cards"}
                  </p>
                </CardContent>
              </Link>

              <button
                type="button"
                onClick={() => handleDelete(deck.id, deck.name)}
                aria-label={`Delete ${deck.name}`}
                className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
