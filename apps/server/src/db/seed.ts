import { eq } from "drizzle-orm";
import { db } from "./index";
import { applications } from "./schema/auth";

/**
 * ID Generation Strategy for Applications:
 *
 * 1. SYSTEM APPS (like admin-portal):
 *    - Use readable slug-based IDs (e.g., "admin-portal")
 *    - Makes debugging and code references easier
 *    - Marked with isSystemApp: true in metadata
 *
 * 2. USER-CREATED APPS (via Admin Portal UI):
 *    - Generate UUID automatically: crypto.randomUUID()
 *    - Slug is user-provided (must be unique)
 *    - ID and slug are different (ID is internal, slug is public)
 */

// System app: uses readable ID matching the slug
const ADMIN_PORTAL_APP = {
  id: "admin-portal", // Readable ID for system app
  name: "Admin Portal",
  slug: "admin-portal",
  secret: crypto.randomUUID(),
  allowedOrigins: "http://localhost:4445,https://admin.au1h.com",
  redirectUris:
    "http://localhost:4445/dashboard,https://admin.au1h.com/dashboard",
  logo: null,
  metadata: JSON.stringify({ isSystemApp: true }),
  isActive: true,
};

async function seed() {
  console.log("🌱 Seeding database...");

  // Check if admin-portal already exists
  const existing = await db
    .select()
    .from(applications)
    .where(eq(applications.slug, "admin-portal"))
    .limit(1);

  if (existing.length > 0) {
    console.log("✓ Admin portal application already exists");
    console.log(`  ID: ${existing[0].id}`);
    console.log(`  Slug: ${existing[0].slug}`);
  } else {
    // Insert admin portal application
    const [inserted] = await db
      .insert(applications)
      .values(ADMIN_PORTAL_APP)
      .returning();

    console.log("✓ Created admin portal application");
    console.log(`  ID: ${inserted.id}`);
    console.log(`  Slug: ${inserted.slug}`);
    console.log(`  Secret: ${inserted.secret}`);
  }

  console.log("\n✅ Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
