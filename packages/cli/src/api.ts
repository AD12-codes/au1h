import { type Config, readConfig } from "./config";
import { CliError } from "./ui";

export interface Application {
  id: string;
  name: string;
  slug: string;
  allowedOrigins: string | null;
  redirectUris: string | null;
  isActive: boolean;
  organizationsEnabled: boolean;
  userCount?: number;
  sessionCount?: number;
  createdAt: string;
}

export interface AppRoute {
  id: string;
  applicationId: string;
  name: string;
  pathPattern: string;
  backendUrl: string;
  methods: string[];
  stripPrefix: boolean;
  isActive: boolean;
  applicationSlug?: string;
}

export interface Me {
  user: { id: string; email: string };
  organization: { id: string; name: string | null; slug: string | null };
  authVia: "session" | "token";
}

export class Api {
  constructor(private readonly config: Config) {}

  static fromConfig(): Api {
    const config = readConfig();
    if (!config) {
      throw new CliError(
        "Not logged in.",
        "Run `au1h login` first, or set AU1H_URL and AU1H_TOKEN."
      );
    }
    return new Api(config);
  }

  get url(): string {
    return this.config.url;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.config.url}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${this.config.token}`,
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      throw new CliError(
        `Cannot reach ${this.config.url}: ${(err as Error).message}`
      );
    }
    if (res.status === 401) {
      throw new CliError(
        "The server rejected the token (401).",
        "Create a new token in the admin portal and run `au1h login` again."
      );
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        details?: { fieldErrors?: Record<string, string[]> };
      };
      const fields = body.details?.fieldErrors
        ? Object.entries(body.details.fieldErrors)
            .map(([k, v]) => `${k}: ${v.join(", ")}`)
            .join("; ")
        : "";
      throw new CliError(
        `${res.status} ${body.message ?? body.error ?? res.statusText}${fields ? ` (${fields})` : ""}`
      );
    }
    return (await res.json()) as T;
  }

  me(): Promise<Me> {
    return this.request<Me>("/api/v1/me");
  }

  async apps(): Promise<Application[]> {
    return (
      await this.request<{ applications: Application[] }>(
        "/api/v1/applications"
      )
    ).applications;
  }

  async appBySlug(slug: string): Promise<Application> {
    const app = (await this.apps()).find((a) => a.slug === slug);
    if (!app) {
      throw new CliError(
        `No application with slug "${slug}" in this workspace.`,
        "Run `au1h apps list`."
      );
    }
    return app;
  }

  createApp(input: {
    name: string;
    slug: string;
    allowedOrigins?: string;
    redirectUris?: string;
  }) {
    return this.request<{ application: Application; secret: string }>(
      "/api/v1/applications",
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
  }

  updateApp(
    id: string,
    input: Partial<
      Pick<
        Application,
        | "name"
        | "allowedOrigins"
        | "redirectUris"
        | "isActive"
        | "organizationsEnabled"
      >
    >
  ) {
    return this.request<{ application: Application }>(
      `/api/v1/applications/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      }
    );
  }

  deleteApp(id: string) {
    return this.request<{ success: boolean }>(`/api/v1/applications/${id}`, {
      method: "DELETE",
    });
  }

  rotateSecret(id: string) {
    return this.request<{ secret: string }>(
      `/api/v1/applications/${id}/regenerate-secret`,
      { method: "POST" }
    );
  }

  async routes(applicationId?: string): Promise<AppRoute[]> {
    const q = applicationId
      ? `?applicationId=${encodeURIComponent(applicationId)}`
      : "";
    return (await this.request<{ routes: AppRoute[] }>(`/api/v1/routes${q}`))
      .routes;
  }

  createRoute(input: {
    applicationId: string;
    name: string;
    pathPattern: string;
    backendUrl: string;
    methods: string[];
    stripPrefix?: boolean;
  }) {
    return this.request<{ route: AppRoute }>("/api/v1/routes", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  deleteRoute(id: string) {
    return this.request<{ success: boolean }>(`/api/v1/routes/${id}`, {
      method: "DELETE",
    });
  }

  toggleRoute(id: string, isActive: boolean) {
    return this.request<{ route: AppRoute }>(`/api/v1/routes/${id}/toggle`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    });
  }
}
