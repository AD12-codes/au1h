import { Hono } from "hono";
import {
  type AdminEnv,
  requireOrgSession,
} from "@/middleware/require-org-session";
import { create, get, list, regenerate, remove, update } from "./controller";

export const applicationsRoute = new Hono<AdminEnv>();

applicationsRoute.use("*", requireOrgSession);

applicationsRoute.get("/", list);
applicationsRoute.get("/:id", get);
applicationsRoute.post("/", create);
applicationsRoute.put("/:id", update);
applicationsRoute.delete("/:id", remove);
applicationsRoute.post("/:id/regenerate-secret", regenerate);
