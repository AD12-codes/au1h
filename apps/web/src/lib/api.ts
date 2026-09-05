const API_BASE = import.meta.env.VITE_SERVER_URL;

// Types
export interface Application {
  id: string;
  name: string;
  slug: string;
  allowedOrigins: string | null;
  redirectUris: string | null;
  logo: string | null;
  metadata: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userCount?: number;
  sessionCount?: number;
}

export interface CreateApplicationInput {
  name: string;
  slug: string;
  allowedOrigins?: string;
  redirectUris?: string;
  logo?: string | null;
  metadata?: string;
}

export interface UpdateApplicationInput
  extends Partial<CreateApplicationInput> {
  isActive?: boolean;
}

// API functions
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

export const applicationsApi = {
  list: () => fetchApi<{ applications: Application[] }>("/api/v1/applications"),

  get: (id: string) =>
    fetchApi<{ application: Application }>(`/api/v1/applications/${id}`),

  create: (data: CreateApplicationInput) =>
    fetchApi<{ application: Application; secret: string }>(
      "/api/v1/applications",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  update: (id: string, data: UpdateApplicationInput) =>
    fetchApi<{ application: Application }>(`/api/v1/applications/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<{ success: boolean }>(`/api/v1/applications/${id}`, {
      method: "DELETE",
    }),

  regenerateSecret: (id: string) =>
    fetchApi<{ secret: string }>(
      `/api/v1/applications/${id}/regenerate-secret`,
      {
        method: "POST",
      }
    ),
};
