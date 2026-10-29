import { Hono } from "hono";
import {
  type AdminEnv,
  requireOrgSession,
} from "@/middleware/require-org-session";
import { requireRole } from "@/middleware/require-role";
import {
  ban,
  get,
  getSessions,
  list,
  revokeAllSessions,
  revokeUserSession,
  unban,
} from "./controller";

export const usersRoute = new Hono<AdminEnv>();

usersRoute.use("*", requireOrgSession);

usersRoute.get("/", list);
usersRoute.get("/:id", get);
usersRoute.get("/:id/sessions", getSessions);
usersRoute.post("/:id/ban", requireRole("owner", "admin"), ban);
usersRoute.post("/:id/unban", requireRole("owner", "admin"), unban);
usersRoute.delete(
  "/:id/sessions",
  requireRole("owner", "admin"),
  revokeAllSessions
);
usersRoute.delete(
  "/sessions/:sessionId",
  requireRole("owner", "admin"),
  revokeUserSession
);
