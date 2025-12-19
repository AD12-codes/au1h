import { Hono } from "hono";
import { getHealth } from "./controller";

export const healthRoute = new Hono();

healthRoute.get("/", getHealth);
