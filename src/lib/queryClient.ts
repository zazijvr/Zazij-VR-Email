import { QueryClient } from '@tanstack/react-query';

// Společná mezipaměť dat z Google API (detail e-mailu, počty, štítky…)
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data jsou „čerstvá“ minutu – návrat na stejný e-mail je okamžitý a bez nového stahování
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      // Desktopová aplikace: přepnutí okna není důvod ke stahování
      refetchOnWindowFocus: false,
    },
  },
});
