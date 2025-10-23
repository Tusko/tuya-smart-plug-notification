import { Hono } from "hono";
import { cors } from "hono/cors";
import apiApp from "./api.js";

const app = new Hono();

app
  .use("/*", cors())
  .route("/", apiApp)
  .notFound((c) => c.text('🙈 Route not found', 404))
  .get("/health", (c) => c.json({
    status: "ok",
    timestamp: new Date().toISOString()
  }));

export default app;
