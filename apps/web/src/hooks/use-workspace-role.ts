import { useQuery } from "@tanstack/react-query";
import { meApi } from "@/lib/api";

export const READ_ONLY_MESSAGE =
  "Read-only: ask a workspace owner or admin for edit access";

export function useWorkspaceRole() {
  const query = useQuery({
    queryKey: ["me"],
    queryFn: () => meApi.get(),
    staleTime: 60_000,
  });

  const role = query.data?.role;
  const isReadOnly = role === "member";

  return {
    role,
    isReadOnly,
    isLoading: query.isLoading,
    message: READ_ONLY_MESSAGE,
  };
}
