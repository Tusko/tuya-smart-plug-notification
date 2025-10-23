import crypto from "crypto";

let token = "";

// Create config from environment variables
function getConfig(env) {
  return {
    /**
     * extend the app:
     * https://www.tuya.com/vas/commodity/CLOUD_INTEGRATION_SERVICE_V2
     * https://platform.tuya.com/cloud/products/detail?abilityId=1442730014117204014&abilityAuth=0&tab=1
     * https://platform.tuya.com/cloud/products/detail?abilityId=1522139760280215643&abilityAuth=0&tab=1&checkSubscribed=1&id=p1673529239955s8ftgu
     *
     */
    /* Service address */
    host: env.TUYA_HOST || "https://openapi.tuyaeu.com",
    /* Access Id */
    accessKey: env.TUYA_ACCESS_KEY,
    /* Access Secret */
    secretKey: env.TUYA_SECRET_KEY,
    /* Interface device_id */
    deviceId: env.TUYA_DEVICE_ID,
    timeFormat: env.TUYA_TIME_FORMAT || "YYYY-MM-DD HH:mm:ss",
  };
}

// Default config for backwards compatibility
export const config = getConfig(process.env);

// Helper function to make HTTP requests with base URL
async function httpClient(url, options = {}, host) {
  const fullUrl = `${host}${url}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(fullUrl, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
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
 * fetch highway login token
 */
export async function getToken(env = process.env) {
  const cfg = getConfig(env);
  const method = "GET";
  const timestamp = Date.now().toString();
  const signUrl = "/v1.0/token?grant_type=1";
  const contentHash = crypto.createHash("sha256").update("").digest("hex");
  const stringToSign = [method, contentHash, "", signUrl].join("\n");
  const signStr = cfg.accessKey + timestamp + stringToSign;

  const headers = {
    t: timestamp,
    sign_method: "HMAC-SHA256",
    client_id: cfg.accessKey,
    sign: await encryptStr(signStr, cfg.secretKey),
  };
  const response = await httpClient("/v1.0/token?grant_type=1", {
    method: 'GET',
    headers,
  }, cfg.host);
  const login = await response.json();
  if (!login || !login.success) {
    throw Error(`Authorization Failed: ${login.msg}`);
  }
  token = login.result.access_token;
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
  body = {},
  cfg
) {
  const t = Date.now().toString();
  const [uri, pathQuery] = path.split("?");

  // Parse query string manually to avoid qs dependency
  const parseQuery = (str) => {
    if (!str) return {};
    return str.split('&').reduce((acc, pair) => {
      const [key, value] = pair.split('=');
      acc[key] = value;
      return acc;
    }, {});
  };

  const queryMerged = Object.assign({}, query, parseQuery(pathQuery));
  const sortedQuery = {};
  Object.keys(queryMerged)
    .sort()
    .forEach((i) => (sortedQuery[i] = queryMerged[i]));

  const stringifyQuery = (obj) => {
    return Object.keys(obj)
      .map(key => `${key}=${obj[key]}`)
      .join('&');
  };

  const querystring = stringifyQuery(sortedQuery);
  const url = querystring ? `${uri}?${querystring}` : uri;
  const contentHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
  const stringToSign = [method, contentHash, "", url].join("\n");
  const signStr = cfg.accessKey + token + t + stringToSign;
  return {
    t,
    path: url,
    client_id: cfg.accessKey,
    sign: await encryptStr(signStr, cfg.secretKey),
    sign_method: "HMAC-SHA256",
    access_token: token,
  };
}

/**
 * Get device information
 */
export async function getDeviceInfo(deviceId, env = process.env) {
  const cfg = getConfig(env);
  const query = {};
  const method = "GET";
  const url = `/v1.1/iot-03/devices/${deviceId}`;
  const reqHeaders = await getRequestSign(url, method, {}, query, {}, cfg);

  const response = await httpClient(reqHeaders.path, {
    method,
    headers: reqHeaders,
  }, cfg.host);
  const data = await response.json();

  if (!data || !data.success) {
    throw Error(`Request ${url}\r\n 🛑 Failed: ${JSON.stringify(data)}`);
  }

  return data;
}

