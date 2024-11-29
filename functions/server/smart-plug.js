const qs = require("qs");
const crypto = require("crypto");
const axios = require("axios").default;
const db = require("./db");

const dayjs = require("dayjs");
const relativeTime = require("dayjs/plugin/relativeTime");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const humanizeDuration = require("humanize-duration");
require("dayjs/locale/uk");

dayjs.extend(relativeTime);
dayjs.extend(timezone);
dayjs.extend(utc);
dayjs.locale("uk");

let token = "";

const config = {
  /**
   * extend the app:
   * https://www.tuya.com/vas/commodity/CLOUD_INTEGRATION_SERVICE_V2
   * https://platform.tuya.com/cloud/products/detail?abilityId=1442730014117204014&abilityAuth=0&tab=1
   * https://platform.tuya.com/cloud/products/detail?abilityId=1522139760280215643&abilityAuth=0&tab=1&checkSubscribed=1&id=p1673529239955s8ftgu
   *
   */
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

async function scrapeAndSendImage(telegramBotToken, chatId) {
  const {getLatestImage, insertImage} = db;
  const latestImage = await getLatestImage();

  const {data} = await axios.get("https://api.loe.lviv.ua/api/menus/9");

  const menuItems = data.menuItems;
  const imageUrl = menuItems[0].imageUrl;

  const lastImage = `https://api.loe.lviv.ua/${imageUrl}`;

  const isExistsImage = latestImage && latestImage.image === imageUrl;

  if (!isExistsImage) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${telegramBotToken}/sendPhoto`,
        {
          photo: lastImage,
          chat_id: chatId,
        }
      );
    } catch (e) {
      console.error("TG image post error:", e);
    }

    insertImage(imageUrl);
  }

  return lastImage;
}

async function smartPlug(tgMsg = true) {
  const botID = "5976108869:AAHFHnaws69eThgoVNi2SafXiAWKPZScauQ";
  const chatID = -1001729031870;
  await getToken();
  let notify = "";

  const {getLatestStatus, insertStatus, getAllStatuses} = db;

  const latestStatus = await getLatestStatus();

  const lastGraphics = await scrapeAndSendImage(botID, chatID);

  try {
    const deviceInfo = await getDeviceInfo(config.deviceId);
    const deviceStatus = deviceInfo.result.online;
    const deviceStatusStr = deviceStatus ? "online" : "offline";
    const dt = dayjs();
    const nowStr = dt.format(config.timeFormat);

    if (!latestStatus) {
      await insertStatus(deviceStatusStr);

      return {
        notify: "🟡 No previuos status",
        latestStatus: {
          status: deviceStatusStr,
          datetime: nowStr,
        },
      };
    }

    const now = dayjs();
    const lastAction = dayjs(latestStatus.datetime.seconds * 1000);
    const duration = lastAction.diff(now, "milliseconds");
    const getTimeDiff = humanizeDuration(duration, {
      round: true,
      largest: 2,
      language: "uk",
      decimal: " ",
      conjunction: " та ",
    });

    if (deviceStatus) {
      if (latestStatus.status === "offline") {
        notify =
          "💡 Світло є\r\n\r\nЕлектроенергія була відсутня: " + getTimeDiff;
        await insertStatus(deviceStatusStr);
      }
    } else {
      if (latestStatus.status === "online") {
        notify =
          "🔴 Світла немає\r\n\r\nЕлектроенергію було увімкнено: " +
          getTimeDiff;
        await insertStatus(deviceStatusStr);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (notify) {
      if (tgMsg) {
        await axios({
          url: `https://api.telegram.org/bot${botID}/sendMessage`,
          method: "post",
          data: {
            chat_id: chatID,
            text: notify,
          },
        });
      }
    } else {
      notify =
        "🟡 No changes from " +
        (latestStatus?.datetime
          ? dayjs(latestStatus.datetime.seconds * 1000).format(
              config.timeFormat
            )
          : "unknown");
    }

    return {
      notify,
      latestStatus,
      allStatuses: await getAllStatuses(),
      lastGraphics,
    };
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
  const reqHeaders = await getRequestSign(url, method, {}, query);

  const req = await httpClient.request({
    method,
    data: {},
    params: {},
    headers: reqHeaders,
    url: reqHeaders.path,
  });
  const {data} = req;

  if (!data || !data.success) {
    throw Error(`Request ${url}\r\n 🛑 Failed: ${JSON.stringify(data)}`);
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
