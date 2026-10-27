ALTER TABLE "organizations" DROP CONSTRAINT "organizations_slug_unique";--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "organizations_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "application_id" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "application_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "application_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_slug_app_unique" UNIQUE NULLS NOT DISTINCT("slug","application_id");