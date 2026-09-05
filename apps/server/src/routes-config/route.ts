import { Hono } from "hono";
import {
  type AdminEnv,
  requireOrgSession,
} from "@/middleware/require-org-session";
import * as controller from "./controller";

export const routesConfigRoute = new Hono<AdminEnv>();

routesConfigRoute.use("*", requireOrgSession);

routesConfigRoute.get("/", controller.list);
routesConfigRoute.get("/:id", controller.get);
routesConfigRoute.post("/", controller.create);
routesConfigRoute.put("/:id", controller.update);
routesConfigRoute.delete("/:id", controller.remove);
routesConfigRoute.patch("/:id/toggle", controller.toggle);
