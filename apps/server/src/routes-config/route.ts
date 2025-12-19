import { Hono } from "hono";
import * as controller from "./controller";

export const routesConfigRoute = new Hono();

routesConfigRoute.get("/", controller.list);
routesConfigRoute.get("/:id", controller.get);
routesConfigRoute.post("/", controller.create);
routesConfigRoute.put("/:id", controller.update);
routesConfigRoute.delete("/:id", controller.remove);
routesConfigRoute.patch("/:id/toggle", controller.toggle);
