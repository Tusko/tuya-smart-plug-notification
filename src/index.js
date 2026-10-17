import { Hono } from "hono";
import { cors } from "hono/cors";
import { bearerAuth } from "hono/bearer-auth";
import { timingSafeEqual } from "hono/utils/buffer";
import apiApp from "./api.js";
import smartPlug from "./smart-plug.js";
import { sendTelegramMessage } from "./utils/telegram.js";
import { createLogger } from "./utils/logger.js";

const app = new Hono();

app
  .use("/*", cors())
  .route("/", apiApp)
  .notFound((c) => c.text('🙈 Route not found', 404))
  // Fails closed: no BROADCAST_KEY configured → every request is rejected.
  .on("POST", ["/broadcast", "/test-bot"], bearerAuth({
    verifyToken: (token, c) => Boolean(c.env.BROADCAST_KEY) && timingSafeEqual(token, c.env.BROADCAST_KEY),
  }), async (c) => {
    const logger = createLogger(c.env);
    logger.info('Test bot request received');
    let message;
    let parseMode;
    try {
      const body = await c.req.json();
      message = body.message;
      parseMode = body.parse_mode;
    } catch (e) {
      // If JSON parsing fails, try form data
      try {
        const formData = await c.req.parseBody();
        message = formData.message;
        parseMode = formData.parse_mode;
      } catch (e2) {
        // If both fail, try query parameter
        message = c.req.query('message');
        parseMode = c.req.query('parse_mode');
      }
    }
    if (parseMode && !['MarkdownV2', 'HTML', 'Markdown'].includes(parseMode)) {
      return c.text('invalid parse_mode, use MarkdownV2 | HTML | Markdown', 400);
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
    let msgTxt = message || 'test bot';
    const botLink = message?.length > 0 ? '' : `\n[СвітлоЄ Бот](${c.env.TELEGRAM_CHANNEL_LINK || 'https://t.me/+hcOVky6W75cwOTNi'})`;

    msgTxt += botLink;

    try {
      const results = await Promise.all(chatIDs.map(async (chatID) => {
        logger.info(`Sending message to chatID: ${chatID}`);
        try {
          const response = await sendTelegramMessage(botToken, chatID, msgTxt, { parseMode });
          const responseData = await response.json();
          logger.info(`Response for chatID ${chatID}:`, responseData);
          if (!response.ok) {
            logger.error(`Telegram API error for chatID ${chatID}:`, responseData);
            throw new Error(`Telegram API error: ${JSON.stringify(responseData)}`);
          }
          return responseData;
        } catch (error) {
          logger.error(`Error sending to chatID ${chatID}:`, error);
          throw error;
        }
      }));
      logger.info('All messages sent successfully', { resultsCount: results.length });
    } catch (error) {
      logger.error('Test bot error:', error);
      logger.error('Error stack:', error.stack);
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
    const logger = createLogger(env);
    logger.info('Cron triggered', { timestamp: new Date().toISOString() });
    try {
      // Use waitUntil to allow the function to complete even if cron handler finishes
      ctx.waitUntil(
        smartPlug(true, env).catch((error) => {
          logger.error('Error in smartPlug function:', error);
          // Log specific error details
          if (error.name === 'AbortError' || error.message?.includes('timed out')) {
            logger.error('Request timeout detected:', error.message);
          }
          // Don't re-throw to prevent cron from failing
        })
      );
    } catch (error) {
      logger.error('Cron handler error:', error);
    }
  }
};
