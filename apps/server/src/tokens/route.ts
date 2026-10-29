import { Hono } from "hono";
import {
  type AdminEnv,
  requireOrgSession,
} from "@/middleware/require-org-session";
import { requireRole } from "@/middleware/require-role";
import { create, list, revoke } from "./controller";

export const tokensRoute = new Hono<AdminEnv>();

tokensRoute.use("*", requireOrgSession);

tokensRoute.get("/", list);
tokensRoute.post("/", requireRole("owner", "admin"), create);
tokensRoute.delete("/:id", requireRole("owner", "admin"), revoke);
