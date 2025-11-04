import { Hono } from "hono";
import { cors } from "hono/cors";
import apiApp from "./api.js";
import smartPlug from "./smart-plug.js";
import { sendTelegramMessage } from "./utils/telegram.js";

const app = new Hono();

app
  .use("/*", cors())
  .route("/", apiApp)
  .notFound((c) => c.text('🙈 Route not found', 404))
  .get("/test-bot", async (c) => {
    console.log('Test bot request:', c.env);
    const chatID = c.env.TELEGRAM_BOT_CHAT_ID;
    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    try {
      await sendTelegramMessage(botToken, chatID, 'test bot');
    } catch (error) {
      console.error('Test bot error:', error);
      return c.text('error', 500);
    }

    return c.text('ok');
  })
  .get("/health", (c) => c.json({
    status: "ok",
    timestamp: new Date().toISOString()
  }));

export default {
  fetch: app.fetch,
  // Scheduled handler for cron triggers
  async scheduled(event, env, ctx) {
    console.log('Cron triggered at:', new Date().toISOString());
    try {
      ctx.waitUntil(smartPlug(true, env));
    } catch (error) {
      console.error('Cron error:', error);
    }
  }
};
