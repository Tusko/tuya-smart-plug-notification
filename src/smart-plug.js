import * as db from "./utils/db.js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import humanizeDuration from "humanize-duration";
import "dayjs/locale/uk.js";
import {getToken, getDeviceInfo} from "./utils/tuya-api.js";
import {sendTelegramMessage, sendTelegramPhoto} from "./utils/telegram.js";
import {createLogger} from "./utils/logger.js";

dayjs.extend(relativeTime);
dayjs.extend(timezone);
dayjs.extend(utc);
dayjs.locale("uk");
dayjs.tz.setDefault("Europe/Kiev");
dayjs.extend(customParseFormat);

/**
 * Parse HTML text to extract schedule groups data
 * @param {string} rawHtml - HTML text with schedule information
 * @returns {Object} - Parsed groups data in format { groups: [...], date: "..." }
 */
function parseScheduleHtml(rawHtml) {
  if (!rawHtml) {
    return {groups: [], date: null};
  }

  // Decode HTML entities
  const decodedHtml = rawHtml
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\n/g, "\n");

  // Extract date from first paragraph (e.g., "Графік погодинних відключень на 17.01.2026")
  // Try to find date in format DD.MM.YYYY after "на" or "Графік"
  const dateMatch = decodedHtml.match(
    /(?:Графік|на)\s+[^]*?(\d{2}\.\d{2}\.\d{4})/,
  );
  const date = dateMatch ? dateMatch[1] : null;

  const groups = [];

  // Extract group information from paragraphs
  // Pattern: "Група X.X. Електроенергії немає з HH:MM до HH:MM, з HH:MM до HH:MM."
  const groupPattern =
    /Група\s+(\d+\.\d+)\.\s+Електроенергії\s+немає\s+(.+?)\./g;
  let match;

  while ((match = groupPattern.exec(decodedHtml)) !== null) {
    const groupId = match[1];
    const scheduleText = match[2];

    // Parse time ranges (e.g., "з 00:00 до 06:00, з 11:00 до 15:00")
    const timeRanges = [];
    const timePattern = /з\s+(\d{2}:\d{2})\s+до\s+(\d{2}:\d{2})/g;
    let timeMatch;

    while ((timeMatch = timePattern.exec(scheduleText)) !== null) {
      const startTime = timeMatch[1];
      const endTime = timeMatch[2];
      timeRanges.push(`${startTime}-${endTime}`);
    }

    groups.push({
      id: groupId,
      date: date,
      status: "Електроенергії немає",
      schedule: timeRanges.join(", "),
    });
  }

  return {groups, date};
}

export async function getScheduleFormattedDate(OCRResult, env) {
  const logger = createLogger(env);
  let formattedDate = "";
  let durationText = "";

  if (OCRResult.groups && OCRResult.groups.length > 0) {
    const myGroup = OCRResult.groups.find(({id}) => id === env.SCHEDULE_ID);

    if (!myGroup) {
      logger.warn(`Group with id ${env.SCHEDULE_ID} not found in OCR results`);
    } else if (!myGroup.date) {
      logger.warn(`Group ${env.SCHEDULE_ID} has no date`);
    } else if (!myGroup.schedule || !myGroup.schedule.trim()) {
      logger.warn(`Group ${env.SCHEDULE_ID} has no schedule`);
    } else {
      const date = myGroup.date;
      const schedule = myGroup.schedule.trim();

      // Handle multiple time ranges separated by commas (e.g., "00:30-04:00, 11:00-18:00, 21:30-24:00")
      const timeRanges = schedule
        .split(",")
        .map((range) => range.trim())
        .filter((range) => range.length > 0);
      const now = dayjs();

      let nextTimeRange = null;

      // Find the next upcoming time range
      for (const timeRange of timeRanges) {
        const timeParts = timeRange.split("-").map((part) => part.trim());
        if (timeParts.length === 2 && timeParts[0] && timeParts[1]) {
          const startTime = timeParts[0];
          const endTime = timeParts[1];

          // Parse date as if it's in Europe/Kiev timezone
          const startDateTime = dayjs.tz(
            `${date} ${startTime}`,
            "DD.MM.YYYY HH:mm",
            "Europe/Kiev",
          );
          const endDateTime = dayjs.tz(
            `${date} ${endTime}`,
            "DD.MM.YYYY HH:mm",
            "Europe/Kiev",
          );

          // Handle case where end time is next day (e.g., 21:30-24:00 becomes 21:30-00:00 next day)
          let actualEndDateTime = endDateTime;
          if (endDateTime.isBefore(startDateTime)) {
            actualEndDateTime = endDateTime.add(1, "day");
          }

          if (startDateTime.isValid() && actualEndDateTime.isValid()) {
            // Check if this range hasn't started yet (start time is in the future)
            // Skip ranges that are currently ongoing or have already ended
            if (startDateTime.isAfter(now)) {
              nextTimeRange = {
                startTime,
                endTime,
                startDateTime,
                endDateTime: actualEndDateTime,
              };
              break; // Found the next upcoming range
            }
          } else {
            logger.warn(
              `Invalid datetime parsing: date=${date}, startTime=${startTime}, endTime=${endTime}, startValid=${startDateTime.isValid()}, endValid=${actualEndDateTime.isValid()}`,
            );
          }
        } else {
          logger.warn(`Invalid time range format: ${timeRange}`);
        }
      }

      // If no upcoming range found, use the first one only if its start time is in the future
      if (!nextTimeRange && timeRanges.length > 0) {
        const firstRange = timeRanges[0].split("-").map((part) => part.trim());
        if (firstRange.length === 2 && firstRange[0] && firstRange[1]) {
          const startTime = firstRange[0];
          const endTime = firstRange[1];
          // Parse date as if it's in Europe/Kiev timezone
          const startDateTime = dayjs.tz(
            `${date} ${startTime}`,
            "DD.MM.YYYY HH:mm",
            "Europe/Kiev",
          );
          let endDateTime = dayjs.tz(
            `${date} ${endTime}`,
            "DD.MM.YYYY HH:mm",
            "Europe/Kiev",
          );

          // Handle case where end time is next day
          if (endDateTime.isBefore(startDateTime)) {
            endDateTime = endDateTime.add(1, "day");
          }

          if (
            startDateTime.isValid() &&
            endDateTime.isValid() &&
            startDateTime.isAfter(now)
          ) {
            nextTimeRange = {startTime, endTime, startDateTime, endDateTime};
          }
        }
      }

      if (nextTimeRange) {
        // Calculate duration
        const durationMinutes = nextTimeRange.endDateTime.diff(
          nextTimeRange.startDateTime,
          "minutes",
        );
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
        logger.warn(
          `No valid time range found for group ${env.SCHEDULE_ID}, date: ${date}, schedule: ${schedule}, now: ${now.format("DD.MM.YYYY HH:mm")}`,
        );
      }
    }
  } else {
    logger.warn("OCRResult.groups is empty or undefined");
  }

  return {formattedDate, durationText};
}

/**
 * Filter schedule to keep only future time ranges
 * @param {string} schedule - Schedule string like "00:00-06:00, 11:00-15:00"
 * @param {string} date - Date string like "17.01.2026"
 * @returns {string} - Filtered schedule with only future ranges
 */
function filterFutureSchedules(schedule, date) {
  if (!schedule || !schedule.trim() || !date) {
    return schedule || "";
  }

  const timeRanges = schedule
    .split(",")
    .map((range) => range.trim())
    .filter((range) => range.length > 0);
  const now = dayjs().tz("Europe/Kiev");
  const futureRanges = [];

  for (const timeRange of timeRanges) {
    const timeParts = timeRange.split("-").map((part) => part.trim());
    if (timeParts.length === 2 && timeParts[0] && timeParts[1]) {
      const startTime = timeParts[0];
      const endTime = timeParts[1];

      // Parse date as if it's in Europe/Kiev timezone
      const startDateTime = dayjs.tz(
        `${date} ${startTime}`,
        "DD.MM.YYYY HH:mm",
        "Europe/Kiev",
      );
      let endDateTime = dayjs.tz(
        `${date} ${endTime}`,
        "DD.MM.YYYY HH:mm",
        "Europe/Kiev",
      );

      // Handle case where end time is next day
      if (endDateTime.isBefore(startDateTime)) {
        endDateTime = endDateTime.add(1, "day");
      }

      if (startDateTime.isValid() && endDateTime.isValid()) {
        // Keep only ranges that haven't ended yet
        if (endDateTime.isAfter(now)) {
          futureRanges.push(timeRange);
        }
      }
    }
  }

  return futureRanges.join(", ");
}

/**
 * Compare two groups arrays and find changes
 * @param {Array} oldGroups - Previous groups state
 * @param {Array} newGroups - New groups state
 * @returns {Object} - Object with changed groups and myGroup info
 */
function findGroupChanges(oldGroups, newGroups) {
  const changes = [];
  const oldGroupsMap = new Map(oldGroups.map((g) => [g.id, g]));
  const newGroupsMap = new Map(newGroups.map((g) => [g.id, g]));

  // Find changed groups
  for (const newGroup of newGroups) {
    const oldGroup = oldGroupsMap.get(newGroup.id);

    // Filter to keep only future schedules for comparison
    const oldFutureSchedule = oldGroup
      ? filterFutureSchedules(oldGroup.schedule, oldGroup.date)
      : "";
    const newFutureSchedule = filterFutureSchedules(
      newGroup.schedule,
      newGroup.date,
    );

    if (
      !oldGroup ||
      oldFutureSchedule !== newFutureSchedule ||
      oldGroup.date !== newGroup.date
    ) {
      changes.push({
        id: newGroup.id,
        oldSchedule: oldFutureSchedule || null,
        newSchedule: newFutureSchedule || null,
        oldDate: oldGroup?.date || null,
        newDate: newGroup.date,
      });
    }
  }

  // Find removed groups (only if they had future schedules)
  for (const oldGroup of oldGroups) {
    if (!newGroupsMap.has(oldGroup.id)) {
      const oldFutureSchedule = filterFutureSchedules(
        oldGroup.schedule,
        oldGroup.date,
      );
      // Only report removal if there were future schedules
      if (oldFutureSchedule) {
        changes.push({
          id: oldGroup.id,
          oldSchedule: oldFutureSchedule,
          newSchedule: null,
          oldDate: oldGroup.date,
          newDate: null,
        });
      }
    }
  }

  return changes;
}

async function scrapeAndSendImage(telegramBotToken, chatIds, env) {
  const logger = createLogger(env);
  const {
    getLatestImage,
    insertImage,
    insertNextNotification,
    getLatestNotification,
    saveGroupsState,
    getLatestGroupsState,
  } = db;
  const latestImage = await getLatestImage(env);

  const scheduleApiUrl = env.SCHEDULE_API_URL || "https://api.loe.lviv.ua";

  const response = await fetch(`${scheduleApiUrl}/api/menus/9`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  const data = await response.json();

  // logger.info("Schedule API response:", data);

  const menuItems = data.menuItems;
  const tomorrowItem = menuItems?.find(({name}) => name === "Tomorrow");

  // Today (default): use first menu item
  const rawHtml = menuItems[0]?.rawHtml;

  logger.info("Raw HTML:", rawHtml);

  if (!rawHtml) {
    logger.warn("No rawHtml found in menuItems");
    return null;
  }

  // Parse HTML to get groups data (Today)
  const {groups, date} = parseScheduleHtml(rawHtml);

  logger.info("Groups:", groups);

  if (!groups || groups.length === 0) {
    logger.warn("No groups found in parsed HTML");
    return null;
  }

  // Get previous groups state
  const previousGroupsState = await getLatestGroupsState(env);
  const hasChanges =
    !previousGroupsState ||
    JSON.stringify(previousGroupsState) !== JSON.stringify(groups);

  // Find my group
  const myGroup = groups.find(({id}) => id === env.SCHEDULE_ID);

  if (!myGroup) {
    logger.warn(`Group with id ${env.SCHEDULE_ID} not found in parsed groups`);
  }

  // Find all group changes
  const groupChanges = previousGroupsState
    ? findGroupChanges(previousGroupsState, groups)
    : [];

  // Check if image URL changed (for backward compatibility)
  const {children} = menuItems.find(({name}) => name === "Arhiv") || {};
  const imageUrl = children?.length
    ? children[children.length - 1]?.imageUrl
    : menuItems[0]?.imageUrl;

  const isExistsImage = latestImage && latestImage.image === imageUrl;

  // If Tomorrow is available and no image stored in DB, send notification with Tomorrow's data
  if (
    tomorrowItem &&
    !latestImage &&
    tomorrowItem.rawHtml &&
    tomorrowItem.imageUrl
  ) {
    try {
      const {groups: tomorrowGroups, date: tomorrowDate} = parseScheduleHtml(
        tomorrowItem.rawHtml,
      );
      if (tomorrowGroups?.length) {
        const tomorrowMyGroup = tomorrowGroups.find(
          ({id}) => id === env.SCHEDULE_ID,
        );
        let tomorrowCaption = "📢 Завтра: графік погодинних відключень";
        if (tomorrowDate) {
          tomorrowCaption += ` (${tomorrowDate})`;
        }
        tomorrowCaption += "\n\n";
        if (tomorrowMyGroup) {
          const ocrResult = {groups: [tomorrowMyGroup]};
          const {formattedDate, durationText} = await getScheduleFormattedDate(
            ocrResult,
            env,
          );
          if (formattedDate) {
            tomorrowCaption += `Група ${env.SCHEDULE_ID}: ${formattedDate}${durationText}`;
          } else {
            tomorrowCaption += `Група ${env.SCHEDULE_ID}: відключень не визначено`;
          }
        } else {
          tomorrowCaption += `Група ${env.SCHEDULE_ID}: не знайдено в графіку`;
        }
        const tomorrowImageUrl = `${scheduleApiUrl}/${tomorrowItem.imageUrl}`;
        logger.info(
          `Sending Tomorrow notification (no image in DB): ${tomorrowImageUrl}`,
        );
        await Promise.all(
          chatIds.map((chatId) =>
            sendTelegramPhoto(
              telegramBotToken,
              chatId,
              tomorrowImageUrl,
              tomorrowCaption,
            ),
          ),
        );
        await insertImage(tomorrowItem.imageUrl, env);
      }
    } catch (e) {
      logger.error("Tomorrow notification error:", e);
    }
  }

  // If we have changes or new image, process and send notifications (Today)
  if (hasChanges || !isExistsImage) {
    try {
      // Get next notification for my group
      let myGroupMessage = "";
      if (myGroup) {
        const OCRResult = {groups: [myGroup]};
        const {formattedDate, durationText} = await getScheduleFormattedDate(
          OCRResult,
          env,
        );

        if (formattedDate) {
          await insertNextNotification(formattedDate, env);
          myGroupMessage = `Наступне вимкнення електроенергії (група ${env.SCHEDULE_ID}): ${formattedDate}${durationText}`;
        } else {
          myGroupMessage = `Наступне вимкнення електроенергії (група ${env.SCHEDULE_ID}) не визначено`;
        }
      }

      // Build message with changes
      let messageParts = [];

      // Always show my group notification if available
      const myGroupChanged = groupChanges.find((c) => c.id === env.SCHEDULE_ID);
      if (myGroupMessage) {
        messageParts.push(`📢 ${myGroupMessage}`);

        // If my group changed, show details
        if (
          myGroupChanged &&
          myGroupChanged.oldSchedule !== myGroupChanged.newSchedule
        ) {
          messageParts.push(`\n🔄 Зміна для групи ${env.SCHEDULE_ID}:`);
          if (myGroupChanged.oldSchedule) {
            messageParts.push(`   Було: ${myGroupChanged.oldSchedule}`);
          }
          messageParts.push(
            `   Стало: ${myGroupChanged.newSchedule || "немає відключень"}`,
          );
        }
      }

      // Add changes for other groups
      const otherGroupChanges = groupChanges.filter(
        (c) => c.id !== env.SCHEDULE_ID,
      );
      if (otherGroupChanges.length > 0) {
        messageParts.push(`\n📋 Зміни в інших групах:`);
        for (const change of otherGroupChanges) {
          messageParts.push(`\n🔄 Група ${change.id}:`);
          if (change.oldSchedule) {
            messageParts.push(`     Було: ${change.oldSchedule}`);
          }
          messageParts.push(
            `     Стало: ${change.newSchedule || "немає відключень"}`,
          );
        }
      }

      const caption =
        messageParts.length > 0
          ? messageParts.join("\n")
          : myGroupMessage || "Немає даних про графік відключень";

      // Send image if URL changed
      if (!isExistsImage && imageUrl) {
        const lastImage = `${scheduleApiUrl}/${imageUrl}`;

        logger.info("Last image:", lastImage);

        await Promise.all(
          chatIds.map((chatId) =>
            sendTelegramPhoto(telegramBotToken, chatId, lastImage, caption),
          ),
        );

        await insertImage(imageUrl, env);
      } else if (hasChanges && messageParts.length > 0) {
        // Send text message if data changed (even if image didn't change)

        logger.info("Sending text message:", caption);

        await Promise.all(
          chatIds.map((chatId) =>
            sendTelegramMessage(telegramBotToken, chatId, caption),
          ),
        );
      } else if (!isExistsImage && messageParts.length > 0) {
        // Send text message if we have message but no image URL
        await Promise.all(
          chatIds.map((chatId) =>
            sendTelegramMessage(telegramBotToken, chatId, caption),
          ),
        );
      }

      // Save new groups state
      await saveGroupsState(groups, env);
    } catch (e) {
      logger.error("TG notification post error:", e);
    }
  } else {
    const latestNotification = await getLatestNotification(env);

    logger.info("No changes, just check for reminders", latestNotification);

    if (latestNotification) {
      try {
        // Check if there are actually future schedules for my group today
        // If no future schedules exist, don't send reminders
        let shouldSendReminder = true;
        const myGroup = groups.find(({id}) => id === env.SCHEDULE_ID);
        if (myGroup) {
          const OCRResult = {groups: [myGroup]};
          const {formattedDate} = await getScheduleFormattedDate(
            OCRResult,
            env,
          );

          logger.info(
            "Formatted date for group",
            env.SCHEDULE_ID,
            ":",
            formattedDate,
          );

          // Only send reminders if there's a valid future schedule
          if (!formattedDate) {
            logger.info(
              `No future schedules for group ${env.SCHEDULE_ID}, skipping reminders`,
            );
            shouldSendReminder = false;
          }
        } else {
          logger.info(
            `Group ${env.SCHEDULE_ID} not found in current schedule, skipping reminders`,
            groups,
          );
          shouldSendReminder = false;
        }

        // Only send reminder if there are future schedules
        if (shouldSendReminder) {
          const now = dayjs().tz("Europe/Kiev");
          let notificationDate = dayjs.tz(
            latestNotification,
            "DD.MM.YYYY HH:mm",
            "Europe/Kiev",
          );

          if (!notificationDate.isValid()) {
            logger.warn(
              `Invalid notification date format: ${latestNotification}`,
            );
          } else if (notificationDate.isAfter(now)) {
            logger.info(
              "Notification date is after now",
              notificationDate,
              now,
            );

            const diff = notificationDate.diff(now, "minutes");

            // Check if we're within the 7-minute cron window (runs every 7 minutes)
            // For 30 min: check between 30 and 23 minutes (7 min window)
            // For 10 min: check between 10 and 3 minutes (7 min window)
            if (
              diff > 0 &&
              ((diff <= 30 && diff > 23) || (diff <= 10 && diff > 3))
            ) {
              logger.info("Sending reminder", diff);
              const minutesLeft = diff <= 30 && diff > 23 ? 30 : 10;
              let message = `⏰ Нагадування: Вимкнення електроенергії через ${minutesLeft} хвилин (група ${env.SCHEDULE_ID})\n`;
              message += `Дата/час: ${notificationDate.format("DD.MM.YYYY HH:mm")} (Europe/Kyiv)\n`;
              const botLink = "\n[СвітлоЄ Бот](https://t.me/+hcOVky6W75cwOTNi)";
              message += "\n" + botLink;
              await Promise.all(
                chatIds.map((chatId) =>
                  sendTelegramMessage(telegramBotToken, chatId, message),
                ),
              );
            }
          }
        }
      } catch (e) {
        logger.error("TG notification post error:", e);
        logger.error("Latest notification value:", latestNotification);
      }
    }
  }

  const lastImage = imageUrl ? `${scheduleApiUrl}/${imageUrl}` : null;
  return lastImage;
}

export default async function smartPlug(tgMsg = true, env = process.env) {
  const botID = env.TELEGRAM_BOT_TOKEN;
  let chatIDs = env.TELEGRAM_BOT_CHAT_ID;
  if (typeof chatIDs === "string") {
    try {
      chatIDs = JSON.parse(chatIDs);
    } catch (e) {
      // If parsing fails, treat as single value
      chatIDs = [chatIDs];
    }
  }
  if (!Array.isArray(chatIDs)) {
    chatIDs = [chatIDs];
  }
  const deviceId = env.TUYA_DEVICE_ID;
  const timeFormat = env.TUYA_TIME_FORMAT || "YYYY-MM-DD HH:mm:ss";

  await getToken(env);
  let notify = "";

  const {getLatestStatus, insertStatus, getAllStatuses} = db;

  const latestStatus = await getLatestStatus(env);

  const lastGraphics = await scrapeAndSendImage(botID, chatIDs, env);

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
    const logger = createLogger(env);
    logger.error("Error in smartPlug function:", e);
  } finally {
    if (notify) {
      if (tgMsg) {
        await Promise.all(
          chatIDs.map((chatID) => sendTelegramMessage(botID, chatID, notify)),
        );
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
