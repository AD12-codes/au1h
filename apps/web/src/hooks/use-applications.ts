import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applicationsApi,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from "@/lib/api";

// Query keys
export const applicationKeys = {
  all: ["applications"] as const,
  lists: () => [...applicationKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...applicationKeys.lists(), filters] as const,
  details: () => [...applicationKeys.all, "detail"] as const,
  detail: (id: string) => [...applicationKeys.details(), id] as const,
};

// Fetch all applications
export function useApplications() {
  return useQuery({
    queryKey: applicationKeys.lists(),
    queryFn: async () => {
      const { applications } = await applicationsApi.list();
      return applications;
    },
  });
}

// Fetch single application
export function useApplication(id: string) {
  return useQuery({
    queryKey: applicationKeys.detail(id),
    queryFn: async () => {
      const { application } = await applicationsApi.get(id);
      return application;
    },
    enabled: !!id,
  });
}

// Create application mutation
export function useCreateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateApplicationInput) =>
      applicationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

// Update application mutation
export function useUpdateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateApplicationInput;
    }) => applicationsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

// Delete application mutation
export function useDeleteApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => applicationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() });
    },
  });
}

// Regenerate secret mutation
export function useRegenerateSecret() {
  return useMutation({
    mutationFn: async (id: string) => applicationsApi.regenerateSecret(id),
  });
}
