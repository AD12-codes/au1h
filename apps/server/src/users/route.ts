import { Hono } from "hono";
import {
  ban,
  get,
  getSessions,
  list,
  revokeAllSessions,
  revokeUserSession,
  unban,
} from "./controller";

export const usersRoute = new Hono();

usersRoute.get("/", list);
usersRoute.get("/:id", get);
usersRoute.get("/:id/sessions", getSessions);
usersRoute.post("/:id/ban", ban);
usersRoute.post("/:id/unban", unban);
usersRoute.delete("/:id/sessions", revokeAllSessions);
usersRoute.delete("/sessions/:sessionId", revokeUserSession);
