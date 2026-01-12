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
  .post("/test-bot", async (c) => {
    console.log('Test bot request:', c.env);
    let message;
    try {
      const body = await c.req.json();
      message = body.message;
    } catch (e) {
      // If JSON parsing fails, try form data
      try {
        const formData = await c.req.parseBody();
        message = formData.message;
      } catch (e2) {
        // If both fail, try query parameter
        message = c.req.query('message');
      }
    }
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
    const botLink = message?.length > 0 ? '' : '\n[СвітлоЄ Бот](https://t.me/+hcOVky6W75cwOTNi)';

    msgTxt += botLink;

    try {
      const results = await Promise.all(chatIDs.map(async (chatID) => {
        console.log(`Sending message to chatID: ${chatID}`);
        try {
          const response = await sendTelegramMessage(botToken, chatID, msgTxt);
          const responseData = await response.json();
          console.log(`Response for chatID ${chatID}:`, responseData);
          if (!response.ok) {
            console.error(`Telegram API error for chatID ${chatID}:`, responseData);
            throw new Error(`Telegram API error: ${JSON.stringify(responseData)}`);
          }
          return responseData;
        } catch (error) {
          console.error(`Error sending to chatID ${chatID}:`, error);
          throw error;
        }
      }));
      console.log('All messages sent successfully:', results);
    } catch (error) {
      console.error('Test bot error:', error);
      console.error('Error stack:', error.stack);
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
