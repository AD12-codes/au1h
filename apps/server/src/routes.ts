import { Hono } from "hono";
import { applicationsRoute } from "./applications/route";
import { healthRoute } from "./health/route";
import { routesConfigRoute } from "./routes-config/route";
import { usersRoute } from "./users/route";

// Create a new Hono instance for v1 routes
export const routes = new Hono();

// Module routes - comment out to disable a module
routes.route("/health", healthRoute);
routes.route("/applications", applicationsRoute);
routes.route("/users", usersRoute);
routes.route("/routes", routesConfigRoute);
