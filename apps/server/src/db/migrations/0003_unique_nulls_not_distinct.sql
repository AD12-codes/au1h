DROP INDEX "accounts_provider_app_unique";--> statement-breakpoint
DROP INDEX "users_email_app_unique";--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_provider_app_unique" UNIQUE NULLS NOT DISTINCT("provider_id","account_id","application_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_app_unique" UNIQUE NULLS NOT DISTINCT("email","application_id");