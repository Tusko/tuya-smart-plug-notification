"use strict";
const express = require("express");
const path = require("path");
const serverless = require("serverless-http");
const app = express();
const bodyParser = require("body-parser");
const smartPlug = require("../smart-plug");

const router = express.Router();
router.get("/", async (req, res) => {
  res.writeHead(200, {"Content-Type": "text/html"});
  const isProd = process.env.NODE_ENV === "production";
  try {
    const {notify, latestStatus, allStatuses} = await smartPlug(isProd);

    let html =
      "<style>* {margin: 0; padding: 0;}</style>" +
      "<h2>Hello from Tuya Smart Plug!</h2><br>" +
      notify +
      '<pre style="width: 100%; background: #f5f5f5">' +
      JSON.stringify(latestStatus, null, "\t") +
      "</pre>";

    if (!isProd) {
      html +=
        "<p>:</p>" +
        '<pre style="width: 100%; background: #f5f5f5">' +
        JSON.stringify(allStatuses, null, "\t") +
        "</pre>";
    }

    res.write(html);
  } catch (err) {
    res.write("<h2>Hello from Tuya Smart Plug!</h2><br>" + err);
  }

  res.end();
});

app.use(bodyParser.json());
app.use("/.netlify/functions/server", router); // path must route to lambda
app.use("/", (req, res) => res.sendFile(path.join(__dirname, "../index.html")));

module.exports = app;
module.exports.handler = serverless(app);
