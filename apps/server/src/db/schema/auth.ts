import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================================
// ORGANIZATIONS - Workspace containers for applications (Better Auth plugin)
// Must be defined before applications for foreign key reference
// ============================================================================
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull(),
  metadata: text("metadata"),
});

// ============================================================================
// APPLICATIONS - Scoped to organizations for multi-tenant isolation
// Each organization manages their own applications
// ============================================================================
export const applications = pgTable("applications", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  secret: text("secret").notNull(), // Hashed API secret for backend auth
  allowedOrigins: text("allowed_origins"), // JSON array of CORS origins
  redirectUris: text("redirect_uris"), // JSON array of valid OAuth redirect URIs
  logo: text("logo"),
  metadata: text("metadata"), // JSON for additional app config
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ============================================================================
// APPLICATION ROUTES - Proxy route configuration per application
// ============================================================================
export const applicationRoutes = pgTable("application_routes", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Human-readable name, e.g., "Get Todos"
  pathPattern: text("path_pattern").notNull(), // e.g., "/todos/*", "/todos/:id"
  backendUrl: text("backend_url").notNull(), // e.g., "http://todo-api:8080"
  methods: text("methods").notNull(), // JSON array: ["GET", "POST"]
  stripPrefix: boolean("strip_prefix").default(true).notNull(), // Remove path prefix before forwarding
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// ============================================================================
// USERS - Admin portal users have NULL applicationId (org-based)
//         Client app users have applicationId set (app-scoped)
// ============================================================================
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    // NULL for admin portal users (organization-based auth)
    // Set for client app users (application-scoped auth)
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    role: text("role"),
    banned: boolean("banned").default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires"),
  },
  (table) => ({
    // Email unique per application (NULL applicationId = admin portal)
    emailAppUnique: uniqueIndex("users_email_app_unique").on(
      table.email,
      table.applicationId
    ),
  })
);

// ============================================================================
// SESSIONS - Scoped to both user and application
// ============================================================================
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  // NULL for admin portal sessions (organization-based)
  applicationId: text("application_id").references(() => applications.id, {
    onDelete: "cascade",
  }),
  activeOrganizationId: text("active_organization_id").references(
    () => organizations.id,
    { onDelete: "set null" }
  ),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
});

// ============================================================================
// ACCOUNTS - OAuth/credential accounts scoped to applications
// ============================================================================
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    // NULL for admin portal accounts (organization-based)
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    // Provider+Account unique per application (NULL = admin portal)
    providerAppUnique: uniqueIndex("accounts_provider_app_unique").on(
      table.providerId,
      table.accountId,
      table.applicationId
    ),
  })
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const members = pgTable("members", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").default("member").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").default("pending").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});
