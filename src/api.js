import { Hono } from "hono";
import smartPlug from "./smart-plug.js";
import { analyzeImageWithGemini } from "./utils/gemini.js";
import { getScheduleFormattedDate } from "./smart-plug.js";
import { createLogger } from "./utils/logger.js";
import { fetchScheduleMenu, parseScheduleHtml } from "./smart-plug.js";
import { generateIcs } from "./utils/ics.js";
import { getToken, getDeviceInfo } from "./utils/tuya-api.js";
import { getLatestStatus } from "./utils/db.js";
import dayjs from "dayjs";

const app = new Hono();

app.get("/", async (c) => {

  const noRender = c.req.query("no-render");
  try {
    const { notify, lastGraphics, latestStatus, allStatuses } = await smartPlug(true, c.env);

    let html = noRender ? "" :
      "<html><head><meta name='viewport' content='width=device-width, initial-scale=1.0'/>" +
      "<title>СвітлоЄ - Tuya Smart Plug</title>" +
      "<style>\
        * {margin: 0; padding: 0;}\
      body {padding: 20px;}\
        p{margin: 0 0 20px;}\
        pre {overflow: auto; width: 100%;background: #f5f5f5;padding: 10px;}\
        img {max-width: 100%; height: auto; vertical-align: middle;}\
      </style>" +
      "</head><body>" +
      "<h2>Hello from Tuya Smart Plug!</h2><br><p>" +
      notify +
      "</p><pre>" +
      JSON.stringify(latestStatus, null, "\t") +
      "</pre>";

    if (lastGraphics) {
      html += noRender ? "" : `<img src="${lastGraphics}" />`;
    }

    if (allStatuses.length) {
      html += noRender ? "" :
        "<p>&nbsp;</p>" +
        "<pre>" +
        JSON.stringify(allStatuses, null, "\t") +
        "</pre>";
    }

    html += noRender ? "" : "</body></html>";

    const logger = createLogger(c.env);
    logger.info("HTML response:", {html});

    return c.html(html);
  } catch (err) {
    const errorHtml = "<h2>Hello from Tuya Smart Plug!</h2><br>" + err.message;
    return c.html(errorHtml, 500);
  }
});

app.get("/test-image-result", async (c) => {
  const testImage = c.req.query("image");
  if (!testImage) {
    return c.json({
      success: false,
      error: "Missing or invalid input. Need an `image`."
    }, 400);
  }

  const env = c.env;

  const {data: OCRResult} = await analyzeImageWithGemini({
    apiKey: env.GEMINI_API_KEY,
    imageUrl: testImage,
  });

  const {formattedDate, durationText} = await getScheduleFormattedDate(OCRResult, env);

  return c.json({
    formattedDate,
    durationText
  })
});

app.get("/ping", (c) => c.text("ok"));

// Dependency health checks. Each returns a small detail object or throws.
const HEALTH_CHECKS = {
  tuya: async (env) => {
    await getToken(env);
    const { result } = await getDeviceInfo(env.TUYA_DEVICE_ID, env);
    return { deviceOnline: result.online };
  },
  firebase: async (env) => {
    const latest = await getLatestStatus(env);
    return {
      latestStatus: latest?.status ?? null,
      since: latest ? new Date(latest.datetime.seconds * 1000).toISOString() : null,
    };
  },
  schedule: async (env) => {
    const menu = await fetchScheduleMenu(env);
    return { menuItems: menu?.length ?? 0 };
  },
  telegram: async (env) => {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram getMe failed: ${data.description}`);
    return { bot: data.result.username };
  },
};

async function runHealthCheck(name, env) {
  const started = Date.now();
  let timer;
  try {
    const detail = await Promise.race([
      HEALTH_CHECKS[name](env),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out after 15s")), 15000);
      }),
    ]);
    return { ok: true, ms: Date.now() - started, ...detail };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /health/all  — run every check in parallel
 * GET /health/:name — run one check (tuya | firebase | schedule | telegram)
 * 200 when all ok, 503 otherwise.
 */
app.get("/health/:name", async (c) => {
  const name = c.req.param("name");
  const names = name === "all" ? Object.keys(HEALTH_CHECKS) : [name];
  if (!names.every((n) => Object.hasOwn(HEALTH_CHECKS, n))) {
    return c.json({ error: `Unknown check. Use: all, ${Object.keys(HEALTH_CHECKS).join(", ")}` }, 404);
  }

  const results = Object.fromEntries(
    await Promise.all(names.map(async (n) => [n, await runHealthCheck(n, c.env)])),
  );
  const ok = Object.values(results).every((r) => r.ok);

  if (!ok) {
    createLogger(c.env).error("Health check failed:", results);
  }

  return c.json({ ok, checks: results, timestamp: new Date().toISOString() }, ok ? 200 : 503);
});

app.get("/no-render", async (c) => {
  try {
    const { notify, latestStatus } = await smartPlug(true, c.env);
    return c.json({
      success: true,
      notify,
      latestStatus,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return c.json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// AI Image Analysis Endpoints

/**
 * POST /analyze-gemini
 * Analyzes one or more images using Google Gemini API
 * Body: { "prompt": "...", "imageUrl": "https://...", "mimeType": "image/jpeg" }
 */
app.post("/analyze-gemini", async (c) => {
  const isDev = c.env.NODE_ENV === "development";

  if (!isDev) {
    return c.json({
      success: true,
      data: {
        message: "Hello from Gemini API!"
      }
    });
  }

  try {
    const body = await c.req.json();
    const { prompt, imageUrl, mimeType } = body;

    if (!imageUrl) {
      return c.json({
        success: false,
        error: "Missing or invalid input. Need an imageUrl."
      }, 400);
    }

    if (!c.env.GEMINI_API_KEY) {
      return c.json({
        success: false,
        error: "GEMINI_API_KEY not configured. Please add GEMINI_API_KEY to your environment variables."
      }, 500);
    }

    const result = await analyzeImageWithGemini({
      apiKey: c.env.GEMINI_API_KEY,
      imageUrl,
      prompt,
      mimeType
    });

    return c.json({
      ...result,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    const logger = createLogger(c.env);
    logger.error("Error in /analyze-gemini:", err);
    return c.json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

/**
 * GET /calendar/:file  (e.g. /calendar/1.1.ics)
 * Live, subscribable ICS feed of a single group's Today+Tomorrow outages.
 */
app.get("/calendar/:file", async (c) => {
  const file = c.req.param("file");
  const groupId = file.replace(/\.ics$/, "");

  // Only accept well-formed group ids like "1.1" / "5.2"; anything else is a
  // bad path, not an empty schedule.
  if (!/^\d+\.\d+$/.test(groupId)) {
    return c.text("🙈 Not found", 404);
  }

  let menuItems;
  try {
    menuItems = await fetchScheduleMenu(c.env);
  } catch (err) {
    const logger = createLogger(c.env);
    logger.error("Calendar: schedule fetch failed:", err);
    return c.text("Schedule API unavailable", 502);
  }

  // Collect the requested group from Today and Tomorrow (skip missing days).
  // Parsing consumes live upstream HTML, so guard it the same way as the
  // fetch above: a shape change upstream should degrade to a clean 502, not
  // an unstyled 500.
  let ics;
  try {
    const dayItems = ["Today", "Tomorrow"]
      .map((name) => menuItems?.find((m) => m.name === name))
      .filter((item) => item && item.rawHtml);

    const groups = [];
    for (const item of dayItems) {
      const { groups: dayGroups } = parseScheduleHtml(item.rawHtml);
      const myGroup = dayGroups.find((g) => g.id === groupId);
      if (myGroup) {
        groups.push(myGroup);
      }
    }

    ics = generateIcs({ groupId, groups, now: dayjs() });
  } catch (err) {
    const logger = createLogger(c.env);
    logger.error("Calendar: schedule parse/generate failed:", err);
    return c.text("Schedule data unavailable", 502);
  }

  return c.body(ics, 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `inline; filename="group-${groupId}.ics"`,
  });
});

export default app;

