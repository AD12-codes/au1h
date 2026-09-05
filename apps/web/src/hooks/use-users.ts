import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_SERVER_URL;

// Types
export interface User {
  id: string;
  applicationId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  updatedAt: string;
  applicationName: string;
  applicationSlug: string;
  sessionCount: number;
}

export interface Session {
  id: string;
  userId: string;
  applicationId: string;
  expiresAt: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ListUsersParams {
  applicationId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ListUsersResult {
  users: User[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// API helper
async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      // /api/v1 resolves the admin session itself (requireOrgSession); the
      // session cookie is all that is needed here.
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

// Query keys
export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (params: ListUsersParams) => [...userKeys.lists(), params] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
  sessions: (id: string) => [...userKeys.detail(id), "sessions"] as const,
};

// Fetch users with pagination and filters
export function useUsers(params: ListUsersParams = {}) {
  const queryString = new URLSearchParams();
  if (params.applicationId) {
    queryString.set("applicationId", params.applicationId);
  }
  if (params.search) {
    queryString.set("search", params.search);
  }
  if (params.page) {
    queryString.set("page", params.page.toString());
  }
  if (params.limit) {
    queryString.set("limit", params.limit.toString());
  }

  const query = queryString.toString();
  const path = `/api/v1/users${query ? `?${query}` : ""}`;

  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => fetchApi<ListUsersResult>(path),
  });
}

// Fetch single user
export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => fetchApi<{ user: User }>(`/api/v1/users/${id}`),
    enabled: !!id,
  });
}

// Fetch user sessions
export function useUserSessions(userId: string) {
  return useQuery({
    queryKey: userKeys.sessions(userId),
    queryFn: () =>
      fetchApi<{ sessions: Session[] }>(`/api/v1/users/${userId}/sessions`),
    enabled: !!userId,
  });
}

// Ban user mutation
export function useBanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      reason,
      expiresAt,
    }: {
      id: string;
      reason?: string;
      expiresAt?: string;
    }) =>
      fetchApi<{ user: User }>(`/api/v1/users/${id}/ban`, {
        method: "POST",
        body: JSON.stringify({ reason, expiresAt }),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

// Unban user mutation
export function useUnbanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) =>
      fetchApi<{ user: User }>(`/api/v1/users/${id}/unban`, {
        method: "POST",
      }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}

// Revoke single session
export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string; userId: string }) =>
      fetchApi<{ success: boolean }>(`/api/v1/users/sessions/${sessionId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userKeys.sessions(userId) });
      queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
    },
  });
}

// Revoke all user sessions
export function useRevokeAllSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) =>
      fetchApi<{ success: boolean; count: number }>(
        `/api/v1/users/${userId}/sessions`,
        {
          method: "DELETE",
        }
      ),
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: userKeys.sessions(userId) });
      queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });
    },
  });
}
