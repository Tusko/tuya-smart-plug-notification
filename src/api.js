import { Hono } from "hono";
import smartPlug from "./smart-plug.js";

const app = new Hono();

app.get("/", async (c) => {
  const isProd = c.env?.NODE_ENV === "production";

  try {
    const { notify, lastGraphics, latestStatus, allStatuses } = await smartPlug(true, c.env);

    let html =
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
      html += `<img src="${lastGraphics}" />`;
    }

    if (allStatuses.length) {
      html +=
        "<p>&nbsp;</p>" +
        "<pre>" +
        JSON.stringify(allStatuses, null, "\t") +
        "</pre>";
    }

    html += "</body></html>";

    return c.html(html);
  } catch (err) {
    const errorHtml = "<h2>Hello from Tuya Smart Plug!</h2><br>" + err.message;
    return c.html(errorHtml, 500);
  }
});

app.get("/ping", (c) => c.text("ok"));

export default app;

