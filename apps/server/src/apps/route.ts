import { Hono } from "hono";
import { type AppEnv, requireAppSecret } from "@/middleware/require-app-secret";
import { introspect, me } from "./controller";

/**
 * Server-to-server API for product backends, authenticated with the
 * application secret (`x-app-id` + `x-app-secret`).
 */
export const appsRoute = new Hono<AppEnv>();

appsRoute.use("*", requireAppSecret);

appsRoute.get("/me", me);
appsRoute.post("/introspect", introspect);
