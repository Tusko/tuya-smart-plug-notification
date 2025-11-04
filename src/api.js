import { Hono } from "hono";
import smartPlug from "./smart-plug.js";
import { analyzeImageWithGemini } from "./utils/gemini.js";

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

    return c.html(html);
  } catch (err) {
    const errorHtml = "<h2>Hello from Tuya Smart Plug!</h2><br>" + err.message;
    return c.html(errorHtml, 500);
  }
});

app.get("/ping", (c) => c.text("ok"));

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
    console.error("Error in /analyze-gemini:", err);
    return c.json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

export default app;

