import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

// dayjs.extend is idempotent and global; extend here so this module works
// regardless of import order relative to smart-plug.js.
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const TZ = "Europe/Kiev";

/**
 * Escape a text value for an ICS property per RFC 5545 (backslash, semicolon,
 * comma, and newlines). Group titles here are simple, but escape defensively.
 * @param {string} text
 * @returns {string}
 */
function escapeText(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Format a Kyiv-local wall-clock datetime as a UTC ICS timestamp (…Z).
 * @param {string} date - "DD.MM.YYYY"
 * @param {string} time - "HH:MM"
 * @returns {dayjs.Dayjs} a dayjs instance in UTC
 */
function kyivToUtc(date, time) {
  return dayjs.tz(`${date} ${time}`, "DD.MM.YYYY HH:mm", TZ).utc();
}

/**
 * Build the VEVENT lines for a single outage time range.
 * @param {string} groupId
 * @param {string} date - "DD.MM.YYYY"
 * @param {string} range - "HH:MM-HH:MM"
 * @returns {string[]} ICS lines, or [] if the range can't be parsed
 */
function outageEventLines(groupId, date, range) {
  const parts = range.split("-").map((p) => p.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return [];
  }
  const [startTime, endTime] = parts;

  const start = kyivToUtc(date, startTime);

  // LOE writes end-of-day as "24:00", which dayjs won't reliably parse.
  // Normalize it to 00:00 and force the +1-day roll below.
  const endIsMidnight = endTime === "24:00";
  const parsedEndTime = endIsMidnight ? "00:00" : endTime;
  let end = kyivToUtc(date, parsedEndTime);

  // Handle end-of-day / overnight ranges (e.g. 21:30-24:00 or 23:00-01:00):
  // "24:00" always rolls; otherwise roll when the end is at or before the start.
  if (endIsMidnight || !end.isAfter(start)) {
    end = kyivToUtc(date, parsedEndTime).add(1, "day");
  }

  if (!start.isValid() || !end.isValid()) {
    return [];
  }

  const fmt = (d) => d.format("YYYYMMDDTHHmmss") + "Z";
  // UID must be stable so re-fetches update rather than duplicate; strip ":".
  const uid = `${groupId}-${date}-${startTime.replace(":", "")}-${endTime.replace(":", "")}@loe-blackouts`;

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escapeText(`Група ${groupId} Відключення світла`)}`,
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Відключення світла скоро почнеться",
    "TRIGGER:-PT30M",
    "END:VALARM",
    "END:VEVENT",
  ];
}

/**
 * Build the VEVENT lines for an all-day "no outage" (power) day.
 * @param {string} groupId
 * @param {string} date - "DD.MM.YYYY"
 * @returns {string[]} ICS lines, or [] if the date can't be parsed
 */
function powerEventLines(groupId, date) {
  const day = dayjs.tz(date, "DD.MM.YYYY", TZ);
  if (!day.isValid()) {
    return [];
  }
  const startDate = day.format("YYYYMMDD");
  const endDate = day.add(1, "day").format("YYYYMMDD");
  const uid = `${groupId}-${date}-power@loe-blackouts`;

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${startDate}`,
    `DTEND;VALUE=DATE:${endDate}`,
    `SUMMARY:${escapeText(`Група ${groupId} Світло НЕ відключається`)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

/**
 * Build a full VCALENDAR string for one group across the given day-groups.
 * @param {object} params
 * @param {string} params.groupId - e.g. "1.1"
 * @param {Array<{id,date,status,schedule}>} params.groups - matched group per day (0-2)
 * @param {dayjs.Dayjs} params.now - timestamp for DTSTAMP (injected for determinism)
 * @returns {string} CRLF-joined ICS document
 */
export function generateIcs({ groupId, groups, now }) {
  const calName = `Група ${groupId} Відключення світла`;
  const dtstamp = now.utc().format("YYYYMMDDTHHmmss") + "Z";

  const eventLines = [];
  for (const group of groups) {
    if (!group || !group.date) {
      continue;
    }
    if (group.status === "power") {
      eventLines.push(...powerEventLines(groupId, group.date));
      continue;
    }
    // outage: one event per comma-separated range
    const ranges = group.schedule
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    for (const range of ranges) {
      eventLines.push(...outageEventLines(groupId, group.date, range));
    }
  }

  // Inject DTSTAMP into every VEVENT (required by RFC 5545).
  const withStamps = [];
  for (const line of eventLines) {
    withStamps.push(line);
    if (line === "BEGIN:VEVENT") {
      withStamps.push(`DTSTAMP:${dtstamp}`);
    }
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//smart-plug//loe-blackouts//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
    `NAME:${escapeText(calName)}`,
    ...withStamps,
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}
