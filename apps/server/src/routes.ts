import { Hono } from "hono";
import { applicationsRoute } from "./applications/route";
import { healthRoute } from "./health/route";
import { routesConfigRoute } from "./routes-config/route";
import { usersRoute } from "./users/route";

// Create a new Hono instance for v1 routes
export const routes = new Hono();

// Public
routes.route("/health", healthRoute);

// Every router below mounts `requireOrgSession` itself: an admin-portal
// session with an active organization is required, and all data is scoped
// to that organization.
routes.route("/applications", applicationsRoute);
routes.route("/users", usersRoute);
routes.route("/routes", routesConfigRoute);
