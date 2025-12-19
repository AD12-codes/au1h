import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4444";

export interface AppRoute {
  id: string;
  applicationId: string;
  name: string;
  pathPattern: string;
  backendUrl: string;
  methods: string[];
  stripPrefix: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppRouteWithApp extends AppRoute {
  applicationName: string;
  applicationSlug: string;
}

export interface CreateRouteInput {
  applicationId: string;
  name: string;
  pathPattern: string;
  backendUrl: string;
  methods: string[];
  stripPrefix?: boolean;
}

export interface UpdateRouteInput {
  name?: string;
  pathPattern?: string;
  backendUrl?: string;
  methods?: string[];
  stripPrefix?: boolean;
  isActive?: boolean;
}

export const routeKeys = {
  all: ["routes"] as const,
  lists: () => [...routeKeys.all, "list"] as const,
  list: (applicationId?: string) =>
    [...routeKeys.lists(), { applicationId }] as const,
  details: () => [...routeKeys.all, "detail"] as const,
  detail: (id: string) => [...routeKeys.details(), id] as const,
};

async function fetchRoutes(applicationId?: string): Promise<AppRoute[]> {
  const url = applicationId
    ? `${API_BASE}/api/v1/routes?applicationId=${applicationId}`
    : `${API_BASE}/api/v1/routes`;

  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch routes");
  }

  const data = await response.json();
  return data.routes;
}

async function fetchRoute(id: string): Promise<AppRoute> {
  const response = await fetch(`${API_BASE}/api/v1/routes/${id}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch route");
  }

  const data = await response.json();
  return data.route;
}

async function createRoute(input: CreateRouteInput): Promise<AppRoute> {
  const response = await fetch(`${API_BASE}/api/v1/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create route");
  }

  const data = await response.json();
  return data.route;
}

async function updateRoute(
  id: string,
  input: UpdateRouteInput
): Promise<AppRoute> {
  const response = await fetch(`${API_BASE}/api/v1/routes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update route");
  }

  const data = await response.json();
  return data.route;
}

async function deleteRoute(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/routes/${id}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to delete route");
  }
}

async function toggleRoute(id: string, isActive: boolean): Promise<AppRoute> {
  const response = await fetch(`${API_BASE}/api/v1/routes/${id}/toggle`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ isActive }),
  });

  if (!response.ok) {
    throw new Error("Failed to toggle route");
  }

  const data = await response.json();
  return data.route;
}

export function useRoutes(applicationId?: string) {
  return useQuery({
    queryKey: routeKeys.list(applicationId),
    queryFn: () => fetchRoutes(applicationId),
  });
}

export function useRoute(id: string) {
  return useQuery({
    queryKey: routeKeys.detail(id),
    queryFn: () => fetchRoute(id),
    enabled: !!id,
  });
}

export function useCreateRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createRoute,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: routeKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: routeKeys.list(data.applicationId),
      });
    },
  });
}

export function useUpdateRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRouteInput }) =>
      updateRoute(id, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: routeKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: routeKeys.list(data.applicationId),
      });
      queryClient.invalidateQueries({ queryKey: routeKeys.detail(data.id) });
    },
  });
}

export function useDeleteRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteRoute,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: routeKeys.lists() });
    },
  });
}

export function useToggleRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleRoute(id, isActive),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: routeKeys.lists() });
      queryClient.invalidateQueries({
        queryKey: routeKeys.list(data.applicationId),
      });
      queryClient.invalidateQueries({ queryKey: routeKeys.detail(data.id) });
    },
  });
}
