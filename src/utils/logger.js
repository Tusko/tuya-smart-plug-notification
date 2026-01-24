/**
 * Sends a log payload to Better Stack.
 */
async function sendRemoteLog(type, message, details = {}, env = {}) {
  const betterStackHost = env.BETTERSTACK_HOST || env.LOG_WORKER_URL;
  const betterStackKey = env.BETTERSTACK_KEY || env.LOG_WORKER_TOKEN;

  // Only log if credentials exist
  if (!betterStackHost || !betterStackKey) return;

  try {
    // Construct Better Stack endpoint URL
    const logUrl = betterStackHost.startsWith("http")
      ? betterStackHost
      : `https://${betterStackHost}`;

    await fetch(logUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${betterStackKey}`,
      },
      body: JSON.stringify({
        level: type,
        message,
        service: env.SERVICE_NAME || "smart-plug",
        environment: env.NODE_ENV || env.ENVIRONMENT || "production",
        ...details,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    // Silently fail - don't break the app if logging fails
    console.warn("Failed to send remote log:", error);
  }
}

/**
 * Main Logger function for console output and remote tracking.
 * Works in Cloudflare Workers environment.
 */
function Logger(type, msg, ...args) {
  // Get environment from global or pass it explicitly
  const env = typeof process !== "undefined" && process.env ? process.env : {};

  if (type === "info") {
    console.log(`📩 ${msg}`, ...args);
    sendRemoteLog("info", msg, {args: args.length > 0 ? args : undefined}, env);
  }

  if (type === "warn") {
    console.warn(`⚠️ ${msg}`, ...args);
    sendRemoteLog("warn", msg, {args: args.length > 0 ? args : undefined}, env);
  }

  if (type === "error") {
    console.error(`❌ ${msg}`, ...args);
    const errorStack =
      args.find((arg) => arg instanceof Error)?.stack || new Error().stack;
    sendRemoteLog(
      "error",
      msg,
      {
        args: args.length > 0 ? args : undefined,
        stack: errorStack,
      },
      env,
    );
  }

  if (type === "log") {
    console.log(msg, ...args);
  }

  if (type === "api-request") {
    console.log(`🚀 API Request: ${msg}`, ...args);
    sendRemoteLog(
      "api-request",
      msg,
      {
        request: args[0] || {},
        args: args.length > 1 ? args.slice(1) : undefined,
      },
      env,
    );
  }

  if (type === "api-response") {
    console.log(`✅ API Response: ${msg}`, ...args);
    sendRemoteLog(
      "api-response",
      msg,
      {
        response: args[0] || {},
        args: args.length > 1 ? args.slice(1) : undefined,
      },
      env,
    );
  }

  if (type === "api-error") {
    console.error(`❌ API Error: ${msg}`, ...args);
    const errorStack =
      args.find((arg) => arg instanceof Error)?.stack || new Error().stack;
    sendRemoteLog(
      "api-error",
      msg,
      {
        error: args[0] || {},
        stack: errorStack,
        args: args.length > 1 ? args.slice(1) : undefined,
      },
      env,
    );
  }
}

/**
 * Logger instance that accepts env parameter
 */
export function createLogger(env = {}) {
  return {
    info: (msg, ...args) => {
      console.log(`📩 ${msg}`, ...args);
      sendRemoteLog(
        "info",
        msg,
        {args: args.length > 0 ? args : undefined},
        env,
      );
    },
    warn: (msg, ...args) => {
      console.warn(`⚠️ ${msg}`, ...args);
      sendRemoteLog(
        "warn",
        msg,
        {args: args.length > 0 ? args : undefined},
        env,
      );
    },
    error: (msg, ...args) => {
      console.error(`❌ ${msg}`, ...args);
      const errorStack =
        args.find((arg) => arg instanceof Error)?.stack || new Error().stack;
      sendRemoteLog(
        "error",
        msg,
        {
          args: args.length > 0 ? args : undefined,
          stack: errorStack,
        },
        env,
      );
    },
    log: (msg, ...args) => {
      console.log(msg, ...args);
    },
    apiRequest: (msg, ...args) => {
      console.log(`🚀 API Request: ${msg}`, ...args);
      sendRemoteLog(
        "api-request",
        msg,
        {
          request: args[0] || {},
          args: args.length > 1 ? args.slice(1) : undefined,
        },
        env,
      );
    },
    apiResponse: (msg, ...args) => {
      console.log(`✅ API Response: ${msg}`, ...args);
      sendRemoteLog(
        "api-response",
        msg,
        {
          response: args[0] || {},
          args: args.length > 1 ? args.slice(1) : undefined,
        },
        env,
      );
    },
    apiError: (msg, ...args) => {
      console.error(`❌ API Error: ${msg}`, ...args);
      const errorStack =
        args.find((arg) => arg instanceof Error)?.stack || new Error().stack;
      sendRemoteLog(
        "api-error",
        msg,
        {
          error: args[0] || {},
          stack: errorStack,
          args: args.length > 1 ? args.slice(1) : undefined,
        },
        env,
      );
    },
  };
}

export default Logger;
export {sendRemoteLog};
