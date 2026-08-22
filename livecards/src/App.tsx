import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthGate } from "@/components/AuthGate";
import { DecksPage } from "@/pages/DecksPage";
import { DeckDetailPage } from "@/pages/DeckDetailPage";
import { StudyPage } from "@/pages/StudyPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate>
          <Routes>
            <Route path="/" element={<DecksPage />} />
            <Route path="/deck/:deckId" element={<DeckDetailPage />} />
            <Route path="/deck/:deckId/study" element={<StudyPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthGate>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
