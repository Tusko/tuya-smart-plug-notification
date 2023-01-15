const qs = require("qs");
const crypto = require("crypto");
const axios = require('axios').default;
const path = require("path");
const dotenv = require("dotenv");
const fs = require("fs");
const dayjs = require("dayjs");
const relativeTime = require("dayjs/plugin/relativeTime");
require('dayjs/locale/uk')

const filePath = path.join("/tmp", "smart-plug__status.txt");

dayjs.extend(relativeTime);
dayjs.locale("uk");
dotenv.config();

const readStatus = function () {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "online/" + dayjs().format(config.timeFormat));
  }

  return fs
    .readFileSync(filePath, "utf-8")
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

async function smartPlug() {
  await getToken();
  let notify = "";
  const [prevStatus, prevTime] = readStatus();

  try {
    const data = await getDeviceInfo(config.deviceId);
    const dt = dayjs();
    const nowStr = dt.format(config.timeFormat);

    const timeDiff = dt.from(dayjs(prevTime, config.timeFormat), true);

    if (data.result.online) {
      if (prevStatus === "offline") {
        notify = "🟢 Online\r\n\r\nЕлектроенергія була відсутня: " + timeDiff;
        console.log(notify);
        fs.writeFileSync(filePath, "online/" + nowStr);
      }
    } else {
      if (prevStatus === "online") {
        notify = "🔴 Offline\r\n\r\nЕлектроенергію було увімкнено: " + timeDiff;
        console.log(notify);
        fs.writeFileSync(filePath, "offline/" + nowStr);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (notify) {
      axios({
        url: 'https://api.telegram.org/bot5976108869:AAHFHnaws69eThgoVNi2SafXiAWKPZScauQ/sendMessage',
        method: 'post',
        data: {
          chat_id: -1001729031870,
          text: notify
        }
      })
        .then(data => console.log(data.result))
    } else {
      notify = "🟡 No changes";
    }

    return notify;
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

async function getDeviceInfo(deviceId) {
  const query = {};
  const method = "GET";
  const url = `/v1.1/iot-03/devices/${deviceId}`;
  const reqHeaders = await getRequestSign(
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
async function encryptStr(str, secret) {
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
  path,
  method,
  headers = {},
  query = {},
  body = {}
) {
  const t = Date.now().toString();
  const [uri, pathQuery] = path.split("?");
  const queryMerged = Object.assign(query, qs.parse(pathQuery));
  const sortedQuery = {};
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

module.exports = smartPlug;
