import * as db from "./utils/db.js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import humanizeDuration from "humanize-duration";
import "dayjs/locale/uk.js";
import { getToken, getDeviceInfo } from "./utils/tuya-api.js";
import { analyzeImageWithGemini } from "./utils/gemini.js";
import { sendTelegramMessage, sendTelegramPhoto } from "./utils/telegram.js";


dayjs.extend(relativeTime);
dayjs.extend(timezone);
dayjs.extend(utc);
dayjs.locale("uk");

async function scrapeAndSendImage(telegramBotToken, chatId, env) {
  const { getLatestImage, insertImage, insertNextNotification, getLatestNotification } = db;
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
      const { data: OCRResult } = await analyzeImageWithGemini({
        apiKey: env.GEMINI_API_KEY,
        imageUrl: lastImage,
      });

    let formattedDate = '';

      if(OCRResult.groups.length > 0) {
        const myGroup = OCRResult.groups.find(({ id }) => id === env.SCHEDULE_ID);
        const date = myGroup.date;
        const schedule = myGroup.schedule?.split('-')?.[0];
        formattedDate = myGroup.schedule?.length ? `${date} ${schedule}` : '';

        await insertNextNotification(formattedDate, env);
      }

      await sendTelegramPhoto(
        telegramBotToken,
        chatId,
        lastImage,
        formattedDate ?
          "Наступне вимкнення електроенергії (група " + env.SCHEDULE_ID + "): " + formattedDate :
          "Наступне вимкнення електроенергії (група " + env.SCHEDULE_ID + ") не визначено"
      );
    } catch (e) {
      console.error("TG image post error:", e);
    }

    await insertImage(imageUrl, env);
  } else {
    const latestNotification = await getLatestNotification(env);
    // send 30 and 10 min before notification
    if(latestNotification) {
      const now = dayjs();
      // Try parsing with time first, then without time
      const notificationDate = dayjs(latestNotification, ["DD.MM.YYYY HH:mm", "DD.MM.YYYY"], true);

      if(notificationDate.isValid()) {
        const diff = notificationDate.diff(now, "minutes");

        // Check if we're within the 7-minute cron window (runs every 7 minutes)
        // For 30 min: check between 30 and 23 minutes (7 min window)
        // For 10 min: check between 10 and 3 minutes (7 min window)
        if(diff > 0 && ((diff <= 30 && diff > 23) || (diff <= 10 && diff > 3))) {
          const minutesLeft = (diff <= 30 && diff > 23) ? 30 : 10;
          await sendTelegramMessage(
            telegramBotToken,
            chatId,
            `⏰ Нагадування: Вимкнення електроенергії через ${minutesLeft} хвилин (група ${env.SCHEDULE_ID})\nДата: ${latestNotification}`
          );
        }
      }
    }
  }

  return lastImage;
}

export default async function smartPlug(tgMsg = true, env = process.env) {
  const botID = env.TELEGRAM_BOT_TOKEN;
  const chatID = env.TELEGRAM_BOT_CHAT_ID;
  const deviceId = env.TUYA_DEVICE_ID;
  const timeFormat = env.TUYA_TIME_FORMAT || "YYYY-MM-DD HH:mm:ss";

  await getToken(env);
  let notify = "";

  const { getLatestStatus, insertStatus, getAllStatuses } = db;

  const latestStatus = await getLatestStatus(env);

  const lastGraphics = await scrapeAndSendImage(botID, chatID, env);

  try {
    const deviceInfo = await getDeviceInfo(deviceId, env);
    const deviceStatus = deviceInfo.result.online;
    const deviceStatusStr = deviceStatus ? "online" : "offline";
    const dt = dayjs();
    const nowStr = dt.format(timeFormat);

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
        await sendTelegramMessage(botID, chatID, notify);
      }
    } else {
      notify =
        "🟡 No changes from " +
        (latestStatus?.datetime
          ? dayjs(latestStatus.datetime.seconds * 1000).format(timeFormat)
          : "unknown");
    }

    return {
      notify,
      latestStatus,
      allStatuses: await getAllStatuses(env),
      lastGraphics,
    };
  }
}

