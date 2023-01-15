import * as qs from "qs";
import * as crypto from "crypto";
import {default as axios} from "axios";
import path from "path";

import * as dotenv from "dotenv";

import fs from "fs";
import dayjs from "dayjs";
import "dayjs/locale/uk";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);
dayjs.locale("uk");
dotenv.config();

// tmp
const nodemailer = require("nodemailer");

let mailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.G_USER,
    pass: process.env.G_PASS,
  },
});

const readStatus = function () {
  return fs
    .readFileSync(path.resolve(__dirname, "../status.txt"), "utf-8")
    .toString()
    .split("/");
};

let token = "";

const config = {
  /* Service address */
  host: "https://openapi.tuyaeu.com",
  /* Access Id */
  accessKey: "yyse7px88ka7mc8qm347",
  /* Access Secret */
  secretKey: "6a33f457df2544868958ed454bd449ad",
  /* Interface device_id */
  deviceId: "bf8829c47e635af1f8dfvf",
  timeFormat: "YYYY-MM-DD HH:mm:ss",
};

const httpClient = axios.create({
  baseURL: config.host,
  timeout: 5 * 1e3,
});

const timeOutS = 10 * 1e3;

async function main() {
  await getToken();
  let notify = "";
  try {
    const data = await getDeviceInfo(config.deviceId);
    const dt = dayjs();
    const nowStr = dt.format(config.timeFormat);

    const [prevStatus, prevTime] = readStatus();
    const timeDiff = dt.from(dayjs(prevTime, config.timeFormat), true);

    if (data.result.online) {
      if (prevStatus === "offline") {
        notify = "🟢 Online\r\n\r\nЕлектроенергія була відсутня: " + timeDiff;
        console.log(notify);
        fs.writeFileSync("status.txt", "online/" + nowStr);
      }
    } else {
      if (prevStatus === "online") {
        notify = "🔴 Offline\r\n\r\nЕлектроенергію було ввімкнено: " + timeDiff;
        console.log(notify);
        fs.writeFileSync("status.txt", "offline/" + nowStr);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (notify) {
      let mailDetails = {
        from: process.env.G_USER,
        to: "tusko@photoinside.me",
        subject: (notify.includes("ffline") ? "🔴" : "🟢") + "Plug notify",
        text: notify,
      };
      mailTransporter.sendMail(mailDetails, function (err, data) {
        if (err) {
          console.log(err);
        } else {
          console.log("Email sent successfully");
        }
      });
    }

    setTimeout(() => main(), timeOutS);
  }
}

/**
 * fetch highway login token
 */
async function getToken() {
  const method = "GET";
  const timestamp = Date.now().toString();
  const signUrl = "/v1.0/token?grant_type=1";
  const contentHash = crypto.createHash("sha256").update("").digest("hex");
  const stringToSign = [method, contentHash, "", signUrl].join("\n");
  const signStr = config.accessKey + timestamp + stringToSign;

  const headers = {
    t: timestamp,
    sign_method: "HMAC-SHA256",
    client_id: config.accessKey,
    sign: await encryptStr(signStr, config.secretKey),
  };
  const {data: login} = await httpClient.get("/v1.0/token?grant_type=1", {
    headers,
  });
  if (!login || !login.success) {
    throw Error(`Authorization Failed: ${login.msg}`);
  }
  token = login.result.access_token;
}

async function getDeviceInfo(deviceId: string) {
  const query = {};
  const method = "GET";
  const url = `/v1.1/iot-03/devices/${deviceId}`;
  const reqHeaders: {[k: string]: string} = await getRequestSign(
    url,
    method,
    {},
    query
  );

  const req = await httpClient.request({
    method,
    data: {},
    params: {},
    headers: reqHeaders,
    url: reqHeaders.path,
  });
  const {data} = req;

  if (!data || !data.success) {
    throw Error(`Request ${url}\r\n 🛑Failed: ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * HMAC-SHA256 crypto function
 */
async function encryptStr(str: string, secret: string): Promise<string> {
  return crypto
    .createHmac("sha256", secret)
    .update(str, "utf8")
    .digest("hex")
    .toUpperCase();
}

/**
 * Request signature, which can be passed as headers
 * @param path
 * @param method
 * @param headers
 * @param query
 * @param body
 */
async function getRequestSign(
  path: string,
  method: string,
  headers: {[k: string]: string} = {},
  query: {[k: string]: any} = {},
  body: {[k: string]: any} = {}
) {
  const t = Date.now().toString();
  const [uri, pathQuery] = path.split("?");
  const queryMerged = Object.assign(query, qs.parse(pathQuery));
  const sortedQuery: {[k: string]: string} = {};
  Object.keys(queryMerged)
    .sort()
    .forEach((i) => (sortedQuery[i] = query[i]));

  const querystring = decodeURIComponent(qs.stringify(sortedQuery));
  const url = querystring ? `${uri}?${querystring}` : uri;
  const contentHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
  const stringToSign = [method, contentHash, "", url].join("\n");
  const signStr = config.accessKey + token + t + stringToSign;
  return {
    t,
    path: url,
    client_id: config.accessKey,
    sign: await encryptStr(signStr, config.secretKey),
    sign_method: "HMAC-SHA256",
    access_token: token,
  };
}

main().catch((err) => {
  throw Error(`ERROE: ${err}`);
});
