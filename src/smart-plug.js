import * as db from "./utils/db.js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import humanizeDuration from "humanize-duration";
import "dayjs/locale/uk.js";
import { getToken, getDeviceInfo } from "./utils/tuya-api.js";

// Helper to get config
function getConfig(env) {
  return {
    deviceId: env.TUYA_DEVICE_ID,
    timeFormat: env.TUYA_TIME_FORMAT || "YYYY-MM-DD HH:mm:ss",
  };
}

dayjs.extend(relativeTime);
dayjs.extend(timezone);
dayjs.extend(utc);
dayjs.locale("uk");

async function scrapeAndSendImage(telegramBotToken, chatId, env) {
  const { getLatestImage, insertImage } = db;
  const latestImage = await getLatestImage(env);

  const scheduleApiUrl = env.SCHEDULE_API_URL || "https://api.loe.lviv.ua";

  const response = await fetch(`${scheduleApiUrl}/api/menus/9`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });
  const data = await response.json();

  const menuItems = data.menuItems;
  const { children } = menuItems.find(({ name }) => name === "Arhiv");

  const imageUrl = children?.length
    ? children[children.length - 1]?.imageUrl
    : menuItems[0].imageUrl;

  const lastImage = `${scheduleApiUrl}/${imageUrl}`;

  const isExistsImage = latestImage && latestImage.image === imageUrl;

  if (!isExistsImage) {
    try {
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendPhoto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          photo: lastImage,
          chat_id: chatId,
        })
      });
    } catch (e) {
      console.error("TG image post error:", e);
    }

    await insertImage(imageUrl, env);
  }

  return lastImage;
}

export default async function smartPlug(tgMsg = true, env = process.env) {
  const botID = env.TELEGRAM_BOT_TOKEN;
  const chatID = env.TELEGRAM_BOT_CHAT_ID;
  const cfg = getConfig(env);

  await getToken(env);
  let notify = "";

  const { getLatestStatus, insertStatus, getAllStatuses } = db;

  const latestStatus = await getLatestStatus(env);

  const lastGraphics = await scrapeAndSendImage(botID, chatID, env);

  try {
    const deviceInfo = await getDeviceInfo(cfg.deviceId, env);
    const deviceStatus = deviceInfo.result.online;
    const deviceStatusStr = deviceStatus ? "online" : "offline";
    const dt = dayjs();
    const nowStr = dt.format(cfg.timeFormat);

    if (!latestStatus) {
      await insertStatus(deviceStatusStr, env);

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
        await insertStatus(deviceStatusStr, env);
      }
    } else {
      if (latestStatus.status === "online") {
        notify =
          "🔴 Світла немає\r\n\r\nЕлектроенергію було увімкнено: " +
          getTimeDiff;
        await insertStatus(deviceStatusStr, env);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (notify) {
      if (tgMsg) {
        await fetch(`https://api.telegram.org/bot${botID}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: notify,
            chat_id: chatID,
          })
        });
      }
    } else {
      notify =
        "🟡 No changes from " +
        (latestStatus?.datetime
          ? dayjs(latestStatus.datetime.seconds * 1000).format(
              cfg.timeFormat
            )
          : "unknown");
    }

    console.log(env.NODE_ENV);

    return {
      notify,
      latestStatus,
      allStatuses: await getAllStatuses(env.NODE_ENV === "production", env),
      lastGraphics,
    };
  }
}

