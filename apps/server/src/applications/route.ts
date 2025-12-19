import { Hono } from "hono";
import { create, get, list, regenerate, remove, update } from "./controller";

export const applicationsRoute = new Hono();

applicationsRoute.get("/", list);
applicationsRoute.get("/:id", get);
applicationsRoute.post("/", create);
applicationsRoute.put("/:id", update);
applicationsRoute.delete("/:id", remove);
applicationsRoute.post("/:id/regenerate-secret", regenerate);
