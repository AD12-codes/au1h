import { Hono } from "hono";
import {
  type AdminEnv,
  requireOrgSession,
} from "@/middleware/require-org-session";
import { requireRole } from "@/middleware/require-role";
import * as controller from "./controller";

export const routesConfigRoute = new Hono<AdminEnv>();

routesConfigRoute.use("*", requireOrgSession);

routesConfigRoute.get("/", controller.list);
routesConfigRoute.get("/:id", controller.get);
routesConfigRoute.post("/", requireRole("owner", "admin"), controller.create);
routesConfigRoute.put("/:id", requireRole("owner", "admin"), controller.update);
routesConfigRoute.delete(
  "/:id",
  requireRole("owner", "admin"),
  controller.remove
);
routesConfigRoute.patch(
  "/:id/toggle",
  requireRole("owner", "admin"),
  controller.toggle
);
