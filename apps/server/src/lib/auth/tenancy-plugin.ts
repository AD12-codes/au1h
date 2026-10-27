import type { BetterAuthPlugin } from "better-auth";

/**
 * Declares the `applicationId` column on the organization plugin's tables so
 * Better Auth's field mapper accepts it in where clauses and inserts. The
 * tenant-scoped adapter (tenant-adapter.ts) is what actually reads and writes
 * it; this plugin only teaches the schema about the field.
 *
 * `user`, `session` and `account` declare the same field through
 * `additionalFields` in lib/auth/index.ts. The core `verification` table
 * cannot be extended this way (plugin schemas replace it rather than merge),
 * so verification rows are scoped by namespacing their identifier instead.
 */
const applicationId = {
  type: "string",
  required: false,
  input: false,
} as const;

export function tenancyPlugin(): BetterAuthPlugin {
  return {
    id: "au1h-tenancy",
    schema: {
      organization: { fields: { applicationId } },
      member: { fields: { applicationId } },
      invitation: { fields: { applicationId } },
    },
  };
}
