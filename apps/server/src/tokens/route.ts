import { Hono } from "hono";
import {
  type AdminEnv,
  requireOrgSession,
} from "@/middleware/require-org-session";
import { create, list, revoke } from "./controller";

export const tokensRoute = new Hono<AdminEnv>();

tokensRoute.use("*", requireOrgSession);

tokensRoute.get("/", list);
tokensRoute.post("/", create);
tokensRoute.delete("/:id", revoke);
