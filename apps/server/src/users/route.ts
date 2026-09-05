import { Hono } from "hono";
import {
  type AdminEnv,
  requireOrgSession,
} from "@/middleware/require-org-session";
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
usersRoute.post("/:id/ban", ban);
usersRoute.post("/:id/unban", unban);
usersRoute.delete("/:id/sessions", revokeAllSessions);
usersRoute.delete("/sessions/:sessionId", revokeUserSession);
