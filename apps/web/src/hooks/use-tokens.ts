import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tokensApi } from "@/lib/api";

export const tokenKeys = {
  all: ["admin-tokens"] as const,
};

export function useTokens() {
  return useQuery({
    queryKey: tokenKeys.all,
    queryFn: async () => (await tokensApi.list()).tokens,
  });
}

export function useCreateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; expiresInDays?: number }) =>
      tokensApi.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tokenKeys.all }),
  });
}

export function useRevokeToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tokensApi.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tokenKeys.all }),
  });
}
