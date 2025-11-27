import * as db from "./utils/db.js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
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
dayjs.tz.setDefault("Europe/Kiev");
dayjs.extend(customParseFormat);

export async function getScheduleFormattedDate(OCRResult, env) {
  let formattedDate = '';
  let durationText = '';

  if(OCRResult.groups && OCRResult.groups.length > 0) {
    const myGroup = OCRResult.groups.find(({ id }) => id === env.SCHEDULE_ID);

    if (!myGroup) {
      console.log(`[WARN] Group with id ${env.SCHEDULE_ID} not found in OCR results`);
    } else if (!myGroup.date) {
      console.log(`[WARN] Group ${env.SCHEDULE_ID} has no date`);
    } else if (!myGroup.schedule || !myGroup.schedule.trim()) {
      console.log(`[WARN] Group ${env.SCHEDULE_ID} has no schedule`);
    } else {
      const date = myGroup.date;
      const schedule = myGroup.schedule.trim();

      // Handle multiple time ranges separated by commas (e.g., "00:30-04:00, 11:00-18:00, 21:30-24:00")
      const timeRanges = schedule.split(',').map(range => range.trim()).filter(range => range.length > 0);
      const now = dayjs();

      let nextTimeRange = null;

      // Find the next upcoming time range
      for (const timeRange of timeRanges) {
        const timeParts = timeRange.split('-').map(part => part.trim());
        if (timeParts.length === 2 && timeParts[0] && timeParts[1]) {
          const startTime = timeParts[0];
          const endTime = timeParts[1];

          // Parse date as if it's in Europe/Kiev timezone
          const startDateTime = dayjs.tz(`${date} ${startTime}`, "DD.MM.YYYY HH:mm", "Europe/Kiev");
          const endDateTime = dayjs.tz(`${date} ${endTime}`, "DD.MM.YYYY HH:mm", "Europe/Kiev");

          // Handle case where end time is next day (e.g., 21:30-24:00 becomes 21:30-00:00 next day)
          let actualEndDateTime = endDateTime;
          if (endDateTime.isBefore(startDateTime)) {
            actualEndDateTime = endDateTime.add(1, 'day');
          }

          if (startDateTime.isValid() && actualEndDateTime.isValid()) {
            // Check if this range hasn't started yet (start time is in the future)
            // Skip ranges that are currently ongoing or have already ended
            if (startDateTime.isAfter(now)) {
              nextTimeRange = { startTime, endTime, startDateTime, endDateTime: actualEndDateTime };
              break; // Found the next upcoming range
            }
          } else {
            console.log(`[WARN] Invalid datetime parsing: date=${date}, startTime=${startTime}, endTime=${endTime}, startValid=${startDateTime.isValid()}, endValid=${actualEndDateTime.isValid()}`);
          }
        } else {
          console.log(`[WARN] Invalid time range format: ${timeRange}`);
        }
      }

      // If no upcoming range found, use the first one only if its start time is in the future
      if (!nextTimeRange && timeRanges.length > 0) {
        const firstRange = timeRanges[0].split('-').map(part => part.trim());
        if (firstRange.length === 2 && firstRange[0] && firstRange[1]) {
          const startTime = firstRange[0];
          const endTime = firstRange[1];
          // Parse date as if it's in Europe/Kiev timezone
          const startDateTime = dayjs.tz(`${date} ${startTime}`, "DD.MM.YYYY HH:mm", "Europe/Kiev");
          let endDateTime = dayjs.tz(`${date} ${endTime}`, "DD.MM.YYYY HH:mm", "Europe/Kiev");

          // Handle case where end time is next day
          if (endDateTime.isBefore(startDateTime)) {
            endDateTime = endDateTime.add(1, 'day');
          }

          if (startDateTime.isValid() && endDateTime.isValid() && startDateTime.isAfter(now)) {
            nextTimeRange = { startTime, endTime, startDateTime, endDateTime };
          }
        }
      }

      if (nextTimeRange) {
        // Calculate duration
        const durationMinutes = nextTimeRange.endDateTime.diff(nextTimeRange.startDateTime, 'minutes');
        const hours = Math.floor(durationMinutes / 60);
        const minutes = durationMinutes % 60;

        if (hours > 0 && minutes > 0) {
          durationText = ` (тривалість: ${hours} год ${minutes} хв)`;
        } else if (hours > 0) {
          durationText = ` (тривалість: ${hours} год)`;
        } else if (minutes > 0) {
          durationText = ` (тривалість: ${minutes} хв)`;
        }

        formattedDate = `${date} ${nextTimeRange.startTime}`;
      } else {
        console.log(`[WARN] No valid time range found for group ${env.SCHEDULE_ID}, date: ${date}, schedule: ${schedule}, now: ${now.format("DD.MM.YYYY HH:mm")}`);
      }
    }

  } else {
    console.log('[WARN] OCRResult.groups is empty or undefined');
  }

  return {formattedDate, durationText};
}

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

      const {formattedDate, durationText} = await getScheduleFormattedDate(OCRResult, env);

      await insertNextNotification(formattedDate, env);

      await sendTelegramPhoto(
        telegramBotToken,
        chatId,
        lastImage,
        formattedDate ?
          "Наступне вимкнення електроенергії (група " + env.SCHEDULE_ID + "): " + formattedDate + durationText :
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

      if(notificationDate.isValid() && notificationDate.isBefore(now)) {
        const diff = notificationDate.diff(now, "minutes");

        // Check if we're within the 7-minute cron window (runs every 7 minutes)
        // For 30 min: check between 30 and 23 minutes (7 min window)
        // For 10 min: check between 10 and 3 minutes (7 min window)
        if(diff > 0 && ((diff <= 30 && diff > 23) || (diff <= 10 && diff > 3))) {
          const minutesLeft = (diff <= 30 && diff > 23) ? 30 : 10;
          await sendTelegramMessage(
            telegramBotToken,
            chatId,
            `⏰ Нагадування: Вимкнення електроенергії через ${minutesLeft} хвилин (група ${env.SCHEDULE_ID})\n
                Дата/час: ${notificationDate.format("DD.MM.YYYY HH:mm")}`
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

