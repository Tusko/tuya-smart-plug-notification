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
    let message = c.req.query('message');
    // Decode URL-encoded message and convert \\n to actual newlines
    if (message) {
      message = decodeURIComponent(message);
      message = message.replace(/\\n/g, '\n');
    }
    let chatIDs = c.env.TELEGRAM_BOT_CHAT_ID;
    if (typeof chatIDs === 'string') {
      try {
        chatIDs = JSON.parse(chatIDs);
      } catch (e) {
        // If parsing fails, treat as single value
        chatIDs = [chatIDs];
      }
    }
    if (!Array.isArray(chatIDs)) {
      chatIDs = [chatIDs];
    }
    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    const msgTxt = message || 'test bot';
    const botLink = '[СвітлоЄ Бот](https://t.me/+hcOVky6W75cwOTNi)';
    try {
      await Promise.all(chatIDs.map(chatID => sendTelegramMessage(
        botToken,
        chatID,
        msgTxt + '\n' + botLink
      )));
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
