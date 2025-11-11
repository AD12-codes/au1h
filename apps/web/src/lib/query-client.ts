/** biome-ignore-all lint/style/noMagicNumbers: <not important> */
import { QueryClient } from "@tanstack/react-query";
import { DEFAULT_MILLISECONDS } from "./constants";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Time in milliseconds that unused/inactive cache data remains in memory
      staleTime: 5 * 60 * DEFAULT_MILLISECONDS, // 5 minutes
      // Time in milliseconds that the cache survives unused/inactive
      gcTime: 10 * 60 * DEFAULT_MILLISECONDS, // 10 minutes (previously cacheTime)
      // Retry failed requests
      retry: 3,
      // Retry delay
      retryDelay: (attemptIndex) =>
        Math.min(
          DEFAULT_MILLISECONDS * 2 ** attemptIndex,
          30 * DEFAULT_MILLISECONDS
        ),
      // Refetch on window focus
      refetchOnWindowFocus: false,
      // Refetch on reconnect
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry failed mutations
      retry: 1,
      // Retry delay for mutations
      retryDelay: DEFAULT_MILLISECONDS,
    },
  },
});
