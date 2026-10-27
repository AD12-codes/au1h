import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    hono: "src/hono.ts",
    express: "src/express.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["jose", "hono", "express"],
});
