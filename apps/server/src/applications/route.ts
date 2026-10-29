import { Hono } from "hono";
import {
  type AdminEnv,
  requireOrgSession,
} from "@/middleware/require-org-session";
import { requireRole } from "@/middleware/require-role";
import { create, get, list, regenerate, remove, update } from "./controller";

export const applicationsRoute = new Hono<AdminEnv>();

applicationsRoute.use("*", requireOrgSession);

applicationsRoute.get("/", list);
applicationsRoute.get("/:id", get);
applicationsRoute.post("/", requireRole("owner", "admin"), create);
applicationsRoute.put("/:id", requireRole("owner", "admin"), update);
applicationsRoute.delete("/:id", requireRole("owner", "admin"), remove);
applicationsRoute.post(
  "/:id/regenerate-secret",
  requireRole("owner", "admin"),
  regenerate
);
