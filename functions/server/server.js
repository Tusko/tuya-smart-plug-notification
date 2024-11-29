"use strict";
const express = require("express");
const serverless = require("serverless-http");
const app = express();
const bodyParser = require("body-parser");
const smartPlug = require("./smart-plug");

const router = express.Router();

router.get("/", async (_, res) => {
  res.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
  const isProd = process.env.NODE_ENV === "production";

  try {
    const {notify, lastGraphics, latestStatus, allStatuses} = await smartPlug(
      isProd
    );

    let html =
      "<html><head><meta name='viewport' content='width=device-width, initial-scale=1.0'/>" +
      "<title>СвітлоЄ - Tuya Smart Plug</title>" +
      "<style>* {margin: 0; padding: 0;} body {padding: 20px;} p{margin: 0 0 20px;} pre {overflow: auto; width: 100%;background: #f5f5f5}</style>" +
      "</head><body>" +
      "<h2>Hello from Tuya Smart Plug!</h2><br><p>" +
      notify +
      "</p><pre>" +
      JSON.stringify(latestStatus, null, "\t") +
      "</pre>";

    if (lastGraphics) {
      html += `<img src="${lastGraphics}" />`;
    }

    if (!isProd) {
      html +=
        "<p>&nbsp;</p>" +
        "<pre>" +
        JSON.stringify(allStatuses, null, "\t") +
        "</pre>";
    }

    html += "</body></html>";

    res.write(html);
  } catch (err) {
    res.write("<h2>Hello from Tuya Smart Plug!</h2><br>" + err);
  }

  res.end();
});

router.get("/ping", (req, res) => res.send("ok"));

app.use(bodyParser.json());
app.use("/api/", router);

module.exports = app;
module.exports.handler = serverless(app);
